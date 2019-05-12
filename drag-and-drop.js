const FileSource = require('tre-file-importer/file-source')

module.exports = function dragAndDrop(onfile) {
  return {
    'ev-dragenter': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.add('drag-hover')
    },
    'ev-dragleave': e => {
      e.preventDefault()
      e.stopPropagation()
      e.target.classList.remove('drag-hover')
    },
    'ev-dragover': e => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'all'
    },
    'ev-drop': e => {
      e.target.classList.remove('drag-hover')
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer.files || []
      function source(file) {
        return opts => FileSource(file, opts)
      }
      for(let file of files) {
        file.source = source(file)
        onfile(file)
      }
    } 
  }
}
