const {client} = require('tre-client')
const Sounds = require('.')
const Finder = require('tre-finder')
const PropertySheet = require('tre-property-sheet')
const Shell = require('tre-editor-shell')
const Importer = require('tre-file-importer')
const WatchMerged = require('tre-prototypes')
const {makePane, makeDivider, makeSplitPane} = require('tre-split-pane')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const watch = require('mutant/watch')
const setStyle = require('module-styles')('tre-sounds-demo')

styles()

client( (err, ssb, config) => {
  if (err) return console.error(err)

  const importer = Importer(ssb, config)
  importer.use(require('./common'))

  const renderFinder = Finder(ssb, {
    importer,
    skipFirstLevel: true,
    details: (kv, ctx) => {
      return kv && kv.meta && kv.meta["prototype-chain"] ? h('i', '(has proto)') : []
    }
  })

  const renderSound = Sounds(ssb, {
    prototypes: config.tre.prototypes
  })

  const where = Value('editor')
  const renderEditor = Editor(ssb, where, renderFinder.primarySelectionObs, renderSound)

  document.body.appendChild(h('.tre-sounds-demo', [
    makeSplitPane({horiz: true}, [
      makePane('25%', [
        renderFinder(config.tre.branches.sounds || config.tre.branches.root)
      ]),
      makeDivider(),
      makePane('70%', [
        renderBar(where),
        renderEditor()
      ])
    ])
  ]))
})

function renderBar(where) {
  return h('.bar', [
    h('select', {
      'ev-change': e => {
        where.set(e.target.value)
      }
    }, [
      h('option', 'editor'),
      h('option', 'stage'),
      h('option', 'thumbnail')
    ])
  ])
}

function Editor(ssb, whereObs, selectionKvObs, renderEditor) {
  const getPreviewObs = PreviewObs(ssb)
  const renderPropertySheet = PropertySheet()
  const renderShell = Shell(ssb, {
    save: (kv, cb) => {
      ssb.publish(kv.value.content, (err, msg) => {
        console.log('publish:', err, msg)
        cb(err, msg)
      })
    }
  })

  return function() {
    return computed(selectionKvObs, kv => {
      if (!kv) return []
      const contentObs = Value(unmergeKv(kv).value.content)
      const previewObs = getPreviewObs(contentObs)

      /*
      const abort2 = watch(contentObs, c => {
        console.warn('contentObs changed', c)
      })
      */

      return h('.tre-sounds-editor', [
        makeSplitPane({horiz: true}, [
          makePane('60%', shellOrStage()),
          makeDivider(),
          makePane('40%', sheet())
        ])
      ])

      function stage(where) {
        return renderEditor(kv, {where, previewObs})  
      }

      function shellOrStage() {
        return computed(whereObs, where => {
          if (where !== 'editor' && where !== 'compact-editor') {
            return stage(where)
          }
          return shell(where)
        })
      }

      function shell(where) {
        return renderShell(kv, {
          renderEditor,
          where,
          contentObs,
          previewObs
        })
      }

      function sheet() {
        return renderPropertySheet(kv, {
          previewObs,
          contentObs
        })
      }
    })
  }
}

function content(kv) {
  return kv && kv.value && kv.value.content
}

function unmergeKv(kv) {
  // if the message has prototypes and they were merged into this message value,
  // return the unmerged/original value
  return kv && kv.meta && kv.meta['prototype-chain'] && kv.meta['prototype-chain'][0] || kv
}
function revisionRoot(kv) {
  return kv && kv.value.content && kv.value.content.revisionRoot || kv && kv.key
}

function PreviewObs(ssb) {
  const watchMerged = WatchMerged(ssb)
  return function(contentObs) {
    const editing_kv = computed(contentObs, content => {
      if (!content) return null
      return {
        key: 'draft',
        value: {
          content
        }
      }
    })
    return watchMerged(editing_kv)
  }
}

function styles() {
  setStyle(`
    body, html, .tre-sounds-demo {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    body {
      --tre-selection-color: green;
      --tre-secondary-selection-color: yellow;
      font-family: sans-serif;
    }
    h1 {
      font-size: 18px;
    }
    .pane {
      background: #eee;
    }
    .tre-finder .summary select {
      font-size: 9pt;
      background: transparent;
      border: none;
      width: 50px;
    }
    .tre-finder summary {
      white-space: nowrap;
    }
    .tre-finder summary:focus {
      outline: 1px solid rgba(255,255,255,0.1);
    }
    .tre-sounds-editor {
      max-width: 1000px;
    }
    .tre-property-sheet {
      font-size: 9pt;
      background: #4a4a4b;
      color: #b6b6b6;
    }

    .tre-property-sheet summary {
      font-weight: bold;
      text-shadow: 0 0 4px black;
      margin-top: .3em;
      padding-top: .4em;
      background: #555454;
      border-top: 1px solid #807d7d;
      margin-bottom: .1em;
    }
    .tre-property-sheet input {
      background: #D0D052;
      border: none;
      margin-left: .5em;
    }
    .tre-property-sheet .inherited input {
      background: #656464;
    }
    .tre-property-sheet .new input {
      background: white;
    }
    .tre-property-sheet details > div {
      padding-left: 1em;
    }
    .tre-property-sheet [data-schema-type="number"] input {
      width: 4em;
    }
    .property[data-schema-type=string] {
      grid-column: span 3;
    }
    .tre-property-sheet .properties {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fill, 5em);
    }
    .tre-property-sheet details {
      grid-column: 1/-1;
    }
  `)
}
