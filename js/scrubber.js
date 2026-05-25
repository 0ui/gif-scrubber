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
    const downloadBar = new ProgressBar.Circle($downloadBar.get(0), barSettings)

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
    }

    const context = {
      display: canvas.display.getContext('2d', { willReadFrequently: true }),
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
    dom.loadingScreen = $('#messages')

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
      if (url === 'undefined' || url === '') {
        return url
      }
      let urlObject
      try {
        urlObject = new URL(url)
        if (urlObject.host.endsWith('redd.it')) {
          // Reddit does not support cache busting parameter
          return url
        }
      } catch (e) {
        console.error(`Bad URL to bust cache (${url})... `, e)
        return url
      }
      urlObject.searchParams.set('gscb', Date.now())
      return urlObject.toString()
    }

    function detectMime(bytes) {
      const header = String.fromCharCode(...bytes.slice(0, 12))
      if (header.startsWith('GIF87a') || header.startsWith('GIF89a'))
        return 'image/gif'
      if (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP')
        return 'image/webp'
      return null
    }

    function confirmGIF(url) {
      return new Promise(function (ignore, use) {
        if (url === 'undefined' || url === '') return ignore('undefined')
        const h = new XMLHttpRequest()
        h.responseType = 'arraybuffer'
        h.open('GET', url)
        h.setRequestHeader('Range', 'bytes=0-15')
        h.onload = () => {
          const bytes = new Uint8Array(h.response, 0, 15)
          const headerStr = String.fromCharCode(...bytes.slice(0, 12))
          console.log('Checking response ' + headerStr)
          const mime = detectMime(bytes)
          if (mime) {
            use({ url, type: mime })
          } else {
            console.error('Bad header:', headerStr)
            ignore('bad header')
          }
        }
        h.onerror = () => ignore('error loading')
        h.send(null)
      })
    }

    // Download GIF
    // ============

    Promise.all(urlList.map(bustCache).map(confirmGIF)).then(
      (reasons) => {
        const messages = {
          'bad header': 'Not a valid GIF or WebP file.',
          undefined: 'URL is undefined.',
          'error loading': 'Error loading URL.',
        }
        const msg = reasons.map((r) => messages[r] || r).join(' ')
        showError(msg)
        console.log(`Could not load file from URL because of: `, reasons)
      },
      (valid) => {
        const downloadUrl = bustCache(valid.url)
        console.log(`File type detected: ${valid.type}`)
        console.time('download')
        const h = new XMLHttpRequest()
        h.responseType = 'arraybuffer'
        h.onload = (request) => {
          console.timeEnd('download')
          downloadReady = handleImage(request.target.response, valid.type)
        }
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
        if (state.decoder) state.decoder.close()
      }

      // Default state
      window.state = state = {
        barWidth: null,
        currentFrame: 0,
        frame() {
          return this.frames[this.currentFrame]
        },
        frameDelay() {
          return this.frame().delayTime / Math.abs(this.speed)
        },
        frames: [],
        playing: false,
        scrubbing: false,
        speed: 1,
        zipGen: new JSZip(),
      }
    }

    function showError(msg) {
      dom.errorMessage.html(`<span class="error">${msg}</span>`)
    }

    async function setupPlayer(width, height) {
      width = Math.round(width)
      height = Math.round(height)
      state.width = width
      state.height = height
      canvas.display.width = width
      canvas.display.height = height
      dom.bar[0].style.width = dom.line[0].style.width = '100%'
      state.barWidth = Math.max(width, 450)
      $('#content').css({ maxWidth: state.barWidth, width: '100%' })

      const openTabs = await preference('open-tabs')
      if (!openTabs) {
        chrome.windows.getCurrent((win) => {
          chrome.windows.update(win.id, {
            width: Math.max(width + 30, 500),
            height: height + 200,
          })
        })
      }
    }

    async function handleImage(buffer, mimeType) {
      console.time('decode')
      init()

      let decoder
      try {
        decoder = new ImageDecoder({ data: buffer, type: mimeType })
        await decoder.tracks.ready
      } catch (e) {
        showError(`Cannot decode ${mimeType}.`)
        return
      }
      const track = decoder.tracks.selectedTrack
      if (!track) {
        showError(`No decodable track found in ${mimeType}.`)
        return
      }
      const frameCount = track.frameCount
      const first = await decoder.decode({ frameIndex: 0 })
      const firstFrame = first.image
      const w = firstFrame.displayWidth || track.displayWidth
      const h = firstFrame.displayHeight || track.displayHeight
      await setupPlayer(w, h)

      state.decoder = decoder
      state.frames = Array.from({ length: frameCount }, (_, i) => ({
        number: i + 1,
        delayTime:
          i === 0
            ? firstFrame.duration
              ? firstFrame.duration / 1000
              : 100
            : undefined,
      }))

      context.display.clearRect(0, 0, state.width, state.height)
      context.display.drawImage(firstFrame, 0, 0)
      console.timeEnd('decode')

      showControls()
      $('#exploding-message').hide()
    }

    // Keyboard and mouse controls
    // ===========================

    async function showControls() {
      dom.player.addClass('displayed')
      dom.loadingScreen.removeClass('displayed')
      await showFrame(state.currentFrame)
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
          if (e.target.tagName !== 'CANVAS') updateScrub(e)
        })
        .on('mouseup', () => (state.scrubbing = false))
        .on('mousemove', (e) => {
          if (Math.abs(e.pageX - state.scrubStart) < 2) return
          state.clicking = false
          if (state.scrubbing || mouseScrub) updateScrub(e)
        })

      dom.bar.on('mousedown', (e) => {
        state.scrubbing = true
        state.scrubStart = e.pageX
        updateScrub(e)
      })
      dom.image
        .on('mousedown', (e) => {
          if (e.target.tagName === 'CANVAS') state.clicking = true
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
    }

    // Drawing to canvas
    // =================

    let decodeToken = 0
    let animFrameId = null
    let lastFrameAt = 0
    let frameBusy = false

    async function showFrame(frameNumber) {
      const lastFrame = state.frames.length - 1
      frameNumber = clamp(frameNumber, 0, lastFrame)
      state.currentFrame = frameNumber

      dom.filler.css(
        'width',
        (frameNumber / lastFrame) * dom.bar[0].offsetWidth
      )

      state.decoder.reset()
      const token = ++decodeToken
      let result
      try {
        result = await state.decoder.decode({ frameIndex: frameNumber })
      } catch (e) {
        // Decode was aborted by a newer showFrame call — ignore
        // This can happen when scrubbing forward and backward
        if (e.name === 'AbortError') return
        throw e
      }
      if (token !== decodeToken) return

      const frame = state.frames[frameNumber]

      if (!frame.delayTime) {
        frame.delayTime = result.image.duration
          ? result.image.duration / 1000
          : 100
      }

      context.display.clearRect(0, 0, state.width, state.height)
      context.display.drawImage(result.image, 0, 0)
    }

    // Toolbar: explode, download, and options
    // =======================================

    async function downloadZip() {
      if (dom.zipIcon.hasClass('fa-spin')) return false
      console.time('download-generate')
      dom.zipIcon.toggleClass('fa-download fa-spinner fa-spin')
      await downloadReady
      if (state.zipGenerated) return
      await renderAllFrames()
      for (const frame of state.frames) {
        const blob = await new Promise((resolve) =>
          frame.canvas.toBlob(resolve, 'image/png', 1.0)
        )
        state.zipGen.file(`Frame ${frame.number}.png`, blob)
      }
      const blob = await state.zipGen.generateAsync({ type: 'blob' })
      saveAs(blob, 'gif-scrubber.zip')
      dom.zipIcon.toggleClass('fa-download fa-spinner fa-spin')
      state.zipGenerated = true
      console.timeEnd('download-generate')
    }

    async function renderAllFrames() {
      for (const frame of state.frames) {
        if (frame.canvas) continue
        const result = await state.decoder.decode({
          frameIndex: frame.number - 1,
        })
        const c = document.createElement('canvas')
        ;[c.width, c.height] = [state.width, state.height]
        c.getContext('2d').drawImage(result.image, 0, 0)
        frame.canvas = c
      }
    }

    async function toggleExplodeView() {
      togglePlaying(false)
      dom.explodeView.toggleClass('displayed')
      if (state.exploded) return
      await renderAllFrames()
      for (const frame of state.frames) dom.explodedFrames.append(frame.canvas)
      state.exploded = true
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
        evt.originalEvent.dataTransfer.dropEffect = 'copy'
      })
      .on('drop', (evt) => {
        evt.preventDefault()
        togglePlaying(false)
        const reader = new FileReader()
        reader.onload = (e) => {
          const buffer = e.target.result
          const bytes = new Uint8Array(buffer.slice(0, 24))
          const mime = detectMime(bytes)
          if (mime) handleImage(buffer, mime)
          else showError('Unsupported file format.')
        }
        reader.readAsArrayBuffer(evt.originalEvent.dataTransfer.files[0])
      })

    // Player controls
    // ===============

    async function updateScrub(e) {
      let mouseX = parseInt(e.pageX - dom.spacer[0].offsetLeft, 10)
      togglePlaying(false)
      const barWidth = dom.bar[0].offsetWidth
      mouseX = clamp(mouseX, 0, barWidth - 1)
      const frame = parseInt(mouseX / barWidth / (1 / state.frames.length), 10)
      if (frame !== state.currentFrame) await showFrame(frame)
    }

    async function advanceFrame(direction) {
      let frameNumber = state.currentFrame + direction

      const loopBackward = frameNumber < 0
      const loopForward = frameNumber >= state.frames.length
      const lastFrame = state.frames.length - 1
      const loopAnim = await preference('loop-anim')

      if (loopBackward || loopForward) {
        if (loopAnim) frameNumber = loopForward ? 0 : lastFrame
        else return togglePlaying(false)
      }

      await showFrame(frameNumber)
      togglePlaying(false)
    }

    async function tick(now) {
      if (!state.playing) return
      if (frameBusy) {
        animFrameId = requestAnimationFrame(tick)
        return
      }

      const elapsed = now - lastFrameAt
      const delay = state.frameDelay()

      if (elapsed >= delay) {
        frameBusy = true
        lastFrameAt += delay

        let next = state.currentFrame + (state.speed > 0 ? 1 : -1)
        const lastFrame = state.frames.length - 1

        if (next < 0 || next > lastFrame) {
          const loopAnim = await preference('loop-anim')
          if (loopAnim) {
            next = next < 0 ? lastFrame : 0
          } else {
            frameBusy = false
            return togglePlaying(false)
          }
        }

        await showFrame(next)
        frameBusy = false
      }

      animFrameId = requestAnimationFrame(tick)
    }

    function togglePlaying(playing) {
      if (state.playing === playing) return
      dom.pausePlayIcon.toggleClass('fa-play', !playing)
      dom.pausePlayIcon.toggleClass('fa-pause', playing)
      if ((state.playing = playing)) {
        lastFrameAt = performance.now()
        animFrameId = requestAnimationFrame(tick)
      } else {
        cancelAnimationFrame(animFrameId)
        animFrameId = null
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
