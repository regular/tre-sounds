const pull = require('pull-stream')
const debug = require('debug')('tre-sounds:common')
const FileSource = require('tre-file-importer/file-source')
const BufferList = require('bl')
const fileType = require('file-type')

function importFiles(ssb, files, opts, cb) {
  opts = opts || {}
  const {prototypes, progress} = opts
  const prototype = prototypes && prototypes.sound
  if (!prototype) return cb(new Error('no sound prototype'))
  if (files.length>1) {
    debug('mult-file import is not supported')
    return cb(true) // we don't do multiple files
  }
  const file = files[0]

  const fileProps = getFileProps(file)
  let bl = BufferList()
  pull(
    file.source(),
    (()=>{
      const total = fileProps.size
      let done = 0
      return pull.through( buff => {
        done += buff.length
        if (progress) {
          progress.set(done/total)
        }
      })
    })(),
    pull.asyncMap( (buff, cb2) => {
      if (bl) {
        bl.append(buff)
        if (bl.length >= fileType.minimumBytes) {
          const ft = fileType(bl.slice())
          bl = null
          if (!ft) return cb2(new Error('Unable to detect file type'))
          debug('detected file type is %s', ft.mime)
          fileProps.type = ft.mime
          if (!ft.mime.startsWith('audio/')) {
            debug('not an audio file')
            cb(true)
            cb2(true)
          }
        }
      }
      cb2(null, buff)
    }),
    ssb.blobs.add( (err, hash) => {
      if (err) return cb(err)
      const name = titleize(file.name)
      const content = {
        type: 'sound',
        prototype,
        name,
        file: fileProps,
        blob: hash
      }
      return cb(null, content)
    })
  )
}

module.exports = {
  importFiles,
  factory
}

function factory(config) {
  const type = 'sound'
  return {
    type,
    i18n: {
      'en': 'sound'
    },
    prototype: function() {
      return {
        type,
        schema: {
          description: 'A sound',
          type: 'object',
          required: ['type'], // require width and height once we can extract them
          properties: {
            type: {
              "const": type
            },
            name: { type: 'string' },
            duration: { type: 'number' }
          }
        }
      }
    },
    content: function() {
      return {
        type,
        prototype: config.tre.prototypes[type]
      }
    }
  }
}

// -- utils

function titleize(filename) {
  return filename.replace(/\.\w{3,4}$/, '').replace(/-/g, ' ')
}

function getFileProps(file) {
  // Object.assign does not work with file objects
  return {
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type,
  }
}
