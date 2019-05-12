// jshint -W018
const h = require('mutant/html-element')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const Str = require('tre-string')
const computed = require('mutant/computed')
const debug = require('debug')('tre-sounds:index')
const dragAndDrop = require('./drag-and-drop')
const setStyle = require('module-styles')('tre-sounds')
const activityIndicator = require('tre-activity-indicator')
const WatchMerged = require('tre-prototypes')
const {isMsgId} = require('ssb-ref')

const {importFiles, factory} = require('./common')

module.exports = function(ssb, opts) {
  opts = opts || {}
  const getSrcObs = Source(ssb)
  const {prototypes} = opts
  if (!prototypes) throw new Error('need prototypes!')

  const watchMerged = WatchMerged(ssb)

  styles()

  return function(kv, ctx) {
    if (!kv) return
    const {value} = kv
    if (!value) return
    if (
      !(value.type === 'sound') &&
      !(value.content && value.content.type === 'sound')
    ) return
    ctx = ctx || {}
    const previewObs = ctx.previewObs || Value(kv)
    const previewContentObs = computed(previewObs, kv => kv && kv.value.content)
    const {currentLanguageObs, languagesObs} = ctx
    const ownContentObs = ctx.contentObs || Value({})
    const srcObs = getSrcObs(previewContentObs)
    const uploading = Value(false)
    const progress = Value(0)
    const {autoplay, loop} = ctx


    function set(o) {
      ownContentObs.set(Object.assign({}, ownContentObs(), o))
    }

    const renderStr = Str({
      save: text => {
        set({name: text})
      }
    })

    const inEditor = (ctx.where || '').includes('editor')
    // See https://github.com/videojs/video.js/issues/455
    if (window.stop) window.stop()

    let el
    function replay() {
      load()
      el.play()
    }

    function load() {
      el.setAttribute('src', srcObs())
      console.log('Loading audio meta data ...')
      el.load()
    }

    const retry = Retry()

    el = h('audio.tre-sound', Object.assign({}, dragAndDrop(upload), {
      hooks: [el=>retry.abort],
      attributes: inEditor ? {
        controls: ''
      } : {},
      src: srcObs,
      //preload: "none",
      autoplay,
      // see https://developers.google.com/web/updates/2017/09/autoplay-policy-changes
      // and https://cs.chromium.org/chromium/src/media/base/media_switches.cc?sq=package:chromium&type=cs&l=179
      //muted: true,
      'ev-error': retry,
      'ev-replay': function() {
        replay()
      },
      'ev-ended': e => {
        if (!e.bubbles) {
          if (el.getAttribute('src') == '') return
          console.warn('tre-sounds: sound ended, freeing network connection')
          // this event doesn't bubble normally, but we want it to!
          el.setAttribute('src', '')
          el.load()
          sendEvent(el, 'ended')
        }
      },
      'ev-loadedmetadata': () => {
        if (!el) {
          console.warn('loadedmetadata withoud audio element')
          return
        }
        console.log(`loaded audio props: ${el.duration}s`)
        uploading.set(false)
        set({
          duration: el.duration
        })
      }
    }))
    
    retry.setElement(el)

    if (!inEditor) return el

    return h('.tre-sounds-editor', [
      h('h1', renderStr(computed(previewObs, kv => kv && kv.value.content.name || 'No Name'))),
      computed(uploading, u => u ? [
        activityIndicator({}),
        h('.upload-progress', computed(progress, p => {
          if (p>0.99) return "Please wait ..."
          return Math.floor(p*100) + '%'
        }))
      ] : [
        el,
        h('.tre-sounds-controls', [
          h('button', {
            'ev-click': ()=> load()
          }, 'Load'),
          h('button', {
            'ev-click': ()=> replay()
          }, 'Play')
        ])
      ])
    ])

    function upload(file) {
      return doImport()
      
      function doImport() {
        uploading.set(true)
        console.log('importing sound')
        importFiles(ssb, [file], {prototypes, progress}, (err, content) => {
          if (err) return console.error(err.message)
          console.log('imported', content)
          set(content)
          setTimeout( ()=>{
            load()
          }, 250)
        })
      }
    }
  }
}

module.exports.importFiles = importFiles
module.exports.factory = factory


function Source(ssb) {
  const blobPrefix = Value()
  ssb.ws.getAddress((err, address) => {
    if (err) return console.error(err)
    address = address.replace(/^ws:\/\//, 'http://').replace(/~.*$/, '/blobs/get/')
    blobPrefix.set(address)
  })

  return function getSrcObs(cObs) {
    return computed([blobPrefix, cObs], (bp, content) => {
      if (!bp) return null
      let contentType = content && content.file && content.file.type
      const blob = content && content.blob
      if (!blob) return null
      return `${bp}${encodeURIComponent(blob)}${contentType ? '?contentType=' + encodeURIComponent(contentType) : ''}`
    }, {comparer: (a,b)=>a==b})
  }
}

// -- utils

function sendEvent(el, name) {
  const event = new UIEvent(name, {
    view: window,
    bubbles: true,
    cancelable: true
  })
  return el.dispatchEvent(event)
}


function styles() {
  setStyle(`
    .tre-sounds-editor {
      height: 100%;
    }
    .tre-sound.empty {
      width: 200px;
      height: 200px;
      border-radius: 10px;
      border: 5px #999 dashed;
    }
    .tre-sound.drag-hover {
      border-radius: 10px;
      border: 5px #994 dashed;
    }
    .tre-sounds-editor .tre-sound {
      width: 100%;
      height: 4em;
    }
  `)
}

function Retry(t) {
  t = t || 250
  let retry = 0
  let timerId, intervalId
  let errorFired = false

  function abort() {
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
    }
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  const onerror = function(ev) {
    errorFired = true
    const el = ev.target
    const src = el.getAttribute('src')
    if (src == '') return // we expect this
    console.warn('Error loading sound')
    timerId = setTimeout( ()=>{
      errorFired = false
      console.warn(`Retry ${retry} to load ${src}`)
      el.setAttribute('src', src)
    }, (1<<retry++) * 250)
  }

  onerror.abort = abort
  onerror.setElement = function(el) {
    if (intervalId) return
    console.warn('actively polling error state on audio element')
    intervalId = setInterval(()=>{
      if (errorFired) return
      if (!el.error) return
      console.warn('audio: .error is set without error event having fired.', el.error.message)
      const src = el.getAttribute('src')
      el.setAttribute('src', src)
    }, 1000)
  }

  return onerror
}
