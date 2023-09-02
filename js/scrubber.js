import { saveAs } from 'file-saver'
import $ from 'jquery'
import JSZip from 'jszip'
import ProgressBar from 'progressbar.js'

const LS = chrome.storage ? chrome.storage.local : browser.storage.local

window.addEventListener(
  'load',
  async () => {
    const manifest = chrome.runtime.getManifest()
    document.title = `${manifest.name} ${manifest.version}`

    function clamp(num, min, max) {
      return Math.min(Math.max(num, min), max)
    }

    async function preference(item) {
      const result = await LS.get(item)
      return result[item]
    }

    // Progress Bars
    // =============

    const barSettings = {
      color: '#fff',
      strokeWidth: 20,
      trailWidth: 1,
      text: {
        autoStyleContainer: false,
      },
      from: { color: '#fff', width: 20 },
      to: { color: '#fff', width: 20 },
      step(state, circle) {
        circle.path.setAttribute('stroke', state.color)
        circle.path.setAttribute('stroke-width', state.width)
        const value = Math.round(circle.value() * 100)
        circle.setText(value === 0 ? '' : `${value}%`)
      },
    }
    const $downloadBar = $('#download-progress-bar')
    const $renderBar = $('#render-progress-bar')
    const downloadBar = new ProgressBar.Circle($downloadBar.get(0), barSettings)
    const renderBar = new ProgressBar.Circle($renderBar.get(0), barSettings)

    // DOM Cache
    // =========

    const dom = {
      errorMessage: $('#error-message'),
      explodedFrames: $('#exploded-frames'),
      filler: $('#scrubber-bar-filler'),
      pausePlayIcon: $('#play-pause-icon'),
      speedList: $('#speed-list'),
      speeds: $('#speed-list td'),
      bar: $('#scrubber-bar'),
      image: $('#image-holder'),
      line: $('#scrubber-bar-line'),
      spacer: $('#bubble-spacer'),
      zipIcon: $('#zip .fa'),
    }

    const canvas = {
      display: $('#canvas-display').get(0),
      render: $('#canvas-render').get(0),
    }

    const context = {
      display: canvas.display.getContext('2d', { willReadFrequently: true }),
      render: canvas.render.getContext('2d', { willReadFrequently: true }),
    }

    // Combine jQuery selections
    const $add = (...el) => el.reduce((x, y) => x.add(y), $())

    dom.explodeView = $add(dom.explodedFrames, dom.spacer, dom.speedList)
    dom.explodeViewToggles = $('#bomb, #exploded-frames .close')
    dom.player = $add(
      dom.bar,
      dom.speedList,
      canvas.display,
      dom.spacer,
      '#toolbar'
    )
    dom.loadingScreen = $add(canvas.render, '#messages', 'body')

    // Validate URL
    // ============

    let downloadReady
    let state = {}
    let url = ''
    const urlString = decodeURIComponent(window.location.hash.substring(1))
    const urlList = JSON.parse(urlString).map(function (u) {
      try {
        const url = new URL(u)

        // Giphy support
        if (url.host.endsWith('giphy.com')) {
          console.log('Found Giphy url...', url.toString())
          url.host = 'i.giphy.com'
          url.pathname = url.pathname
            .split('.')
            .toSpliced(-1, 1, 'gif')
            .join('.')
          console.log('Transformed to... ', url.toString())
          return url.toString()
        }

        // Imgur support
        if (url.host.endsWith('imgur.com')) {
          console.log('Found Imgur url...', url.toString())
          url.host = 'i.imgur.com'
          url.pathname = url.pathname
            .split('.')
            .toSpliced(-1, 1, 'gif')
            .join('.')
          console.log('Transformed to... ', url.toString())
          return url.toString()
        }

        // Reddit support
        if (url.host.endsWith('redd.it')) {
          console.log('Found Reddit url...', url.toString())
          url.hostname = 'i.redd.it'
          url.search = ''
          console.log('Transformed to... ', url.toString())
          return url.toString()
        }

        console.log(`No match for ${url.toString()}...`)
        return url.toString()
      } catch (e) {
        return u
      }
    })

    function bustCache(url) {
      if (url === 'undefined') {
        return url
      }
      const urlObject = new URL(url)
      urlObject.searchParams.set('gscb', Date.now())
      return urlObject.toString()
    }

    function confirmGIF(url) {
      return new Promise(function (ignore, use) {
        if (url === 'undefined') return ignore('undefined')
        const h = new XMLHttpRequest()
        h.open('GET', url)
        h.setRequestHeader('Range', 'bytes=0-5')
        h.onload = () => {
          const validHeaders = ['GIF87a', 'GIF89a']
          if (validHeaders.includes(h.responseText.slice(0, 6))) use(url)
          else ignore('bad header')
        }
        h.onerror = () => ignore('error loading')
        h.send(null)
      })
    }

    // Download GIF
    // ============

    Promise.all(urlList.map(bustCache).map(confirmGIF)).then(
      (reason) => {
        showError('Not a valid GIF file.')
        console.log('Could not load GIF from URL because: ', reason)
      },
      (validUrl) => {
        const downloadUrl = bustCache(validUrl)
        console.time('download')
        const h = new XMLHttpRequest()
        h.responseType = 'arraybuffer'
        h.onload = (request) =>
          (downloadReady = handleGIF(request.target.response))
        h.onprogress = (e) =>
          e.lengthComputable && downloadBar.set(e.loaded / e.total)
        h.onerror = showError.bind(null, downloadUrl)
        h.open('GET', downloadUrl, true)
        h.send()
        url = downloadUrl
      }
    )

    // Initialize player
    // =================

    function init() {
      // Clean up any previous scrubbing
      if (!$.isEmptyObject(state)) {
        $('#exploding-message').hide()
        $('#exploded-frames > img').remove()
        context.display.clearRect(0, 0, state.width, state.height)
      }

      // Default state
      window.state = state = {
        barWidth: null,
        currentFrame: 0,
        debug: {
          showRawFrames: false,
        },
        hasTransparency: false,
        keyFrameRate: 15, // Performance: Pre-render every n frames
        frame() {
          return this.frames[this.currentFrame]
        },
        frameDelay() {
          return this.frame().delayTime / Math.abs(this.speed)
        },
        frames: [],
        playing: false,
        playTimeoutId: null,
        scrubbing: false,
        speed: 1,
        zipGen: new JSZip(),
      }
    }

    function showError(msg) {
      dom.errorMessage.html(`<span class="error">${msg}</span>`)
    }

    async function handleGIF(buffer) {
      console.timeEnd('download')
      console.time('parse')
      const bytes = new Uint8Array(buffer)
      init()

      // Image dimensions
      const dimensions = new Uint16Array(buffer, 6, 2)
      ;[state.width, state.height] = dimensions
      canvas.render.width = canvas.display.width = state.width
      canvas.render.height = canvas.display.height = state.height
      dom.bar[0].style.width =
        dom.line[0].style.width =
        state.barWidth =
          Math.max(state.width, 450)
      $('#content').css({ width: state.barWidth, height: state.height })

      // Adjust window size
      const openTabs = await preference('open-tabs')
      if (!openTabs) {
        chrome.windows.getCurrent((win) => {
          chrome.windows.update(win.id, {
            width: Math.max(state.width + 280, 740),
            height: clamp(state.height + 340, 410, 850),
          })
        })
      }

      // Record global color table
      let pos = 13 + colorTableSize(bytes[10])
      const gct = bytes.subarray(13, pos)

      state.frames = parseFrames(buffer, pos, gct, state.keyFrameRate)
      console.timeEnd('parse')

      return renderKeyFrames()
        .then(showControls)
        .then(renderIntermediateFrames)
        .then(explodeFrames)
        .catch((err) => console.error('Rendering GIF failed!', err))
    }

    const chainPromises = [(x, y) => x.then(y), Promise.resolve()]

    function renderKeyFrames() {
      console.time('render-keyframes')
      return state.frames
        .map((frame) => () => {
          return createImageBitmap(frame.blob)
            .then((bitmap) => {
              frame.drawable = bitmap
              return frame
            })
            .then(renderAndSave)
        })
        .reduce(...chainPromises)
    }

    function renderIntermediateFrames() {
      // console.time('background-render')
      return state.frames
        .map((frame) => () => renderAndSave(frame))
        .reduce(...chainPromises)
    }

    function explodeFrames() {
      // console.timeEnd('background-render')
      state.frames.map((x) => dom.explodedFrames.append(x.canvas))
      $('#exploding-message').hide()
    }

    // Keyboard and mouse controls
    // ===========================

    async function showControls() {
      console.timeEnd('render-keyframes')
      // console.time('background-render')
      dom.player.addClass('displayed')
      dom.loadingScreen.removeClass('displayed')
      showFrame(state.currentFrame)
      const autoPlay = await preference('auto-play')
      const mouseScrub = await preference('mouse-scrub')
      const backgroundColor = await preference('background-color')
      togglePlaying(autoPlay)
      canvas.display.classList.add(backgroundColor)

      $('#url')
        .val(url)
        .on('mousedown mouseup mousmove', (e) => e.stopPropagation())
        .on('keydown', (e) => {
          e.stopPropagation()
          if (e.keyCode === 13) {
            const url = encodeURIComponent($('#url').val())
            location.href =
              location.href.replace(location.hash, '') +
              '#' +
              JSON.stringify([url])
            location.reload()
          }
        })

      $(document)
        .on('mousedown', '#bubble-spacer', (e) => {
          state.scrubbing = true
          state.scrubStart = e.pageX
        })
        .on('mouseup', () => (state.scrubbing = false))
        .on('mousemove', (e) => {
          if (Math.abs(e.pageX - state.scrubStart) < 2) return
          state.clicking = false
          if (state.scrubbing || mouseScrub) updateScrub(e)
        })

      dom.bar.on('mousedown', updateScrub)
      dom.image
        .on('mousedown', (e) => {
          state.clicking = true
        })
        .on('mouseup', (e) => {
          if (state.clicking) togglePlaying(!state.playing)
          state.clicking = false
        })

      document.body.onkeydown = (e) => {
        switch (e.keyCode) {
          case 8: // Backspace
          case 27: // Escape
          case 69:
            return toggleExplodeView() // E
          case 32:
            return togglePlaying(!state.playing) // Space
          case 37:
            return advanceFrame(-1) // Left Arrow
          case 39:
            return advanceFrame(1) // Right Arrow
          case 79:
            return options() // O
        }
      }

      if (state.debug.showRawFrames) throw 'abort rendering frames'
    }

    // GIF parsing
    // ===========

    function colorTableSize(packedHeader) {
      const tableFlag = packedHeader.bits(0, 1)
      if (tableFlag !== 1) return 0
      const size = packedHeader.bits(5, 3)
      return 3 * Math.pow(2, size + 1)
    }

    function parseFrames(buffer, pos, gct, keyFrameRate) {
      const bytes = new Uint8Array(buffer)
      const trailer = new Uint8Array([0x3b])
      const frames = []
      let gce = {
        disposalMethod: 0,
        transparent: 0,
        delayTime: 10,
      }
      let packed

      // Rendering 87a GIFs didn't work right for some reason.
      // Forcing the 89a header made them work.
      const headerBytes = 'GIF89a'.split('').map((x) => x.charCodeAt(0), [])
      const nextBytes = bytes.subarray(6, 13)
      const header = new Uint8Array(13)
      header.set(headerBytes)
      header.set(nextBytes, 6)

      while (pos < bytes.length) {
        switch (bytes[pos]) {
          case 0x21:
            switch (bytes[pos + 1]) {
              case 0xf9: // Graphics control extension...
                packed = bytes[pos + 3]
                gce = {
                  pos: pos,
                  disposalMethod: packed.bits(3, 3),
                  transparent: packed.bits(7, 1),
                  delayTime: bytes[pos + 4],
                  tci: bytes[pos + 6],
                }
                pos += 8
                break
              case 0xfe:
                pos -= 12 // Comment extension fallthrough...
              case 0xff:
                pos -= 1 // Application extension fallthrough...
              case 0x01:
                pos += 15 // Plain Text extension fallthrough...
              default: // Skip data sub-blocks
                while (bytes[pos] !== 0x00) pos += bytes[pos] + 1
                pos++
            }
            break
          case 0x2c: {
            // `New image frame at ${pos}`
            const [x, y, w, h] = new Uint16Array(buffer.slice(pos + 1, pos + 9))
            const frame = {
              disposalMethod: gce.disposalMethod,
              delayTime: gce.delayTime < 2 ? 100 : gce.delayTime * 10,
              isKeyFrame: frames.length % keyFrameRate === 0 && !!frames.length,
              isRendered: false,
              number: frames.length + 1,
              transparent: gce.transparent,
              pos: { x, y },
              size: { w, h },
            }

            // We try to detect transparency in first frame after drawing...
            // But we assume transparency if using method 2 since the background
            // could show through
            if (frame.disposalMethod === 2) {
              state.hasTransparency = true
            }

            // Skip local color table
            const imageStart = pos
            pos += colorTableSize(bytes[pos + 9]) + 11

            // Skip data blocks
            while (bytes[pos] !== 0x00) pos += bytes[pos] + 1
            let imageBlocks = bytes.subarray(imageStart, ++pos)

            // Use a Graphics Control Extension
            if (typeof gce.pos !== 'undefined') {
              imageBlocks = bytes
                .subarray(gce.pos, gce.pos + 4) // Begin ext
                .concat(new Uint8Array([0x00, 0x00])) // Zero out the delay time
                .concat(bytes.subarray(gce.pos + 6, gce.pos + 8)) // End ext
                .concat(imageBlocks)
            }

            const data = header.concat(gct).concat(imageBlocks).concat(trailer)
            frame.blob = new Blob([data], { type: 'image/gif' })
            frames.push(frame)
            break
          }
          case 0x3b: // End of file
            return frames
          default:
            return showError('Error: Could not decode GIF')
        }
      }
    }

    // Drawing to canvas
    // =================

    function renderAndSave(frame) {
      renderFrame(frame, context.render)
      if (frame.isRendered || !frame.isKeyFrame) {
        frame.isKeyFrame = true
        return Promise.resolve()
      }
      return new Promise(function (resolve, reject) {
        frame.putable = context.render.getImageData(
          0,
          0,
          state.width,
          state.height
        )
        frame.blob = null
        frame.drawable = null
        frame.isRendered = true
        const c = (frame.canvas = document.createElement('canvas'))
        ;[c.width, c.height] = [state.width, state.height]
        c.getContext('2d', { willReadFrequently: true }).putImageData(
          frame.putable,
          0,
          0
        )
        renderBar.set(frame.number / state.frames.length)
        setTimeout(resolve, 0)
      })
    }

    function renderFrame(frame, ctx) {
      const [{ x, y }, { w, h }, method] = [
        frame.pos,
        frame.size,
        frame.disposalMethod,
      ]
      const full = [0, 0, state.width, state.height]
      const prevFrame = state.frames[frame.number - 2]

      if (!prevFrame) {
        ctx.clearRect(...full) // First frame, wipe the canvas clean
      } else {
        // Disposal method 0 or 1: draw image only
        // Disposal method 2: draw image then erase portion just drawn
        // Disposal method 3: draw image then revert to previous frame
        const [{ x, y }, { w, h }, method] = [
          prevFrame.pos,
          prevFrame.size,
          prevFrame.disposalMethod,
        ]
        if (method === 2) ctx.clearRect(x, y, w, h)
        if (method === 3) ctx.putImageData(prevFrame.backup, 0, 0)
      }

      frame.backup = method === 3 ? ctx.getImageData(...full) : null
      drawFrame(frame, ctx)

      // Check first frame for transparency
      if (!prevFrame && !state.hasTransparency && !state.firstFrameChecked) {
        state.firstFrameChecked = true
        const data = ctx.getImageData(0, 0, state.width, state.height).data
        for (let i = 0, l = data.length; i < l; i += 4) {
          if (data[i + 3] === 0) {
            // Check alpha of each pixel in frame 0
            state.hasTransparency = true
            break
          }
        }
      }
    }

    function drawFrame(frame, ctx) {
      if (frame.drawable)
        ctx.drawImage(frame.drawable, 0, 0, state.width, state.height)
      else ctx.putImageData(frame.putable, 0, 0)
    }

    function showFrame(frameNumber) {
      const lastFrame = state.frames.length - 1
      frameNumber = clamp(frameNumber, 0, lastFrame)
      const frame = state.frames[(state.currentFrame = frameNumber)]
      let fillX = (frameNumber / lastFrame) * state.barWidth - 2
      dom.filler.css('left', Math.max(0, fillX))

      // Draw current frame only if it's already rendered
      if (frame.isRendered || state.debug.showRawFrames) {
        if (state.hasTransparency) {
          context.display.clearRect(0, 0, state.width, state.height)
        }
        return drawFrame(frame, context.display)
      }

      // Rendering not complete. Draw all frames since latest key frame as well
      const first = Math.max(
        0,
        frameNumber - (frameNumber % state.keyFrameRate)
      )
      for (let i = first; i <= frameNumber; i++) {
        renderFrame(state.frames[i], context.display)
      }
    }

    // Toolbar: explode, download, and options
    // =======================================

    function downloadZip() {
      if (dom.zipIcon.hasClass('fa-spin')) return false
      console.time('download-generate')
      dom.zipIcon.toggleClass('fa-download fa-spinner fa-spin')
      downloadReady.then(() => {
        let p = Promise.resolve()
        if (!state.zipGenerated) {
          p = state.frames
            .map((frame) => () => {
              return new Promise((resolve) => {
                frame.canvas.toBlob(
                  (blob) => {
                    state.zipGen.file(`Frame ${frame.number}.png`, blob)
                    frame.blob = blob
                    resolve()
                  },
                  'image/png',
                  1.0
                )
              })
            })
            .reduce(...chainPromises)
        }
        p.then(() => {
          state.zipGen.generateAsync({ type: 'blob' }).then((blob) => {
            saveAs(blob, 'gif-scrubber.zip')
            dom.zipIcon.toggleClass('fa-download fa-spinner fa-spin')
          })
          state.zipGenerated = true
          console.timeEnd('download-generate')
        })
      })
    }

    function toggleExplodeView() {
      togglePlaying(false)
      dom.explodeView.toggleClass('displayed')
    }

    function options() {
      chrome.tabs.create({ url: 'options.html' })
    }

    $('a').click((e) => e.preventDefault())
    $('#gear').on('click', options)
    $('#zip').on('click', downloadZip)
    dom.explodeViewToggles.on('click', toggleExplodeView)

    // Drag and drop
    // =============

    $('body')
      .on('dragover', (evt) => {
        evt.stopPropagation()
        evt.preventDefault()
        evt.dataTransfer.dropEffect = 'copy'
      })
      .on('drop', (evt) => {
        evt.preventDefault()
        togglePlaying(false)
        const reader = new FileReader()
        reader.onload = (e) => handleGIF(e.target.result)
        reader.readAsArrayBuffer(evt.dataTransfer.files[0])
      })

    // Player controls
    // ===============

    function updateScrub(e) {
      let mouseX = parseInt(e.pageX - dom.spacer[0].offsetLeft, 10)
      togglePlaying(false)
      mouseX = clamp(mouseX, 0, state.barWidth - 1)
      const frame = parseInt(
        mouseX / state.barWidth / (1 / state.frames.length),
        10
      )
      if (frame !== state.currentFrame) showFrame(frame)
    }

    async function advanceFrame(direction = 'auto') {
      let frameNumber = state.currentFrame
      if (direction === 'auto') frameNumber += state.speed > 0 ? 1 : -1
      else frameNumber += direction

      const loopBackward = frameNumber < 0
      const loopForward = frameNumber >= state.frames.length
      const lastFrame = state.frames.length - 1
      const loopAnim = await preference('loop-anim')

      if (loopBackward || loopForward) {
        if (loopAnim) frameNumber = loopForward ? 0 : lastFrame
        else return togglePlaying(false)
      }

      showFrame(frameNumber)

      if (direction === 'auto') {
        state.playTimeoutId = setTimeout(advanceFrame, state.frameDelay())
      } else {
        togglePlaying(false)
      }
    }

    function togglePlaying(playing) {
      if (state.playing === playing) return
      dom.pausePlayIcon.toggleClass('fa-pause', playing)
      if ((state.playing = playing)) {
        state.playTimeoutId = setTimeout(advanceFrame, state.frameDelay())
      } else {
        clearTimeout(state.playTimeoutId)
      }
    }

    dom.speeds.on('click', function () {
      if (this.id === 'play-pause') return togglePlaying(!state.playing)
      state.speed = Number(this.innerText)
      togglePlaying(true)
      dom.speeds.removeClass('selected')
      $(this).addClass('selected')
    })
  },
  false
)

// Utilities
// =========

Uint8Array.prototype.concat = function (newArr) {
  const result = new Uint8Array(this.length + newArr.length)
  result.set(this)
  result.set(newArr, this.length)
  return result
}

Uint8Array.prototype.string = function () {
  return this.reduce((prev, curr) => prev + String.fromCharCode(curr), '')
}

Number.prototype.bits = function (startBit, length) {
  let string = this.toString(2)
  while (string.length < 8) string = '0' + string // Zero pad
  string = string.substring(startBit, startBit + (length || 1))
  return parseInt(string, 2)
}
