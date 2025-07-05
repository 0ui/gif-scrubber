const LS = chrome.storage.local

function showContextMenu(info, tab) {
  if (info.menuItemId !== 'gif-scrubber') return
  let link = encodeURIComponent(info.linkUrl || '')
  let src = encodeURIComponent(info.srcUrl || '')
  let urls = JSON.stringify([link, src])

  LS.get('open-tabs').then((options) => {
    if (options['open-tabs']) {
      chrome.tabs.create({
        url: `popup.html#${urls}`,
        active: false,
      })
    } else {
      chrome.windows.create({
        url: `popup.html#${urls}`,
        width: 470,
        height: 430,
        type: 'popup',
      })
    }
  })
}

export const defaults = {
  'open-tabs': false,
  'auto-open': false,
  'auto-play': true,
  'loop-anim': true,
  'mouse-scrub': false,
  'background-color': 'dark',
}

// Set default options & create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  LS.get(Object.keys(defaults)).then((options) => {
    const toSet = {}
    Object.entries(defaults).forEach(([key, val]) => {
      if (typeof options[key] === 'undefined') {
        toSet[key] = val
      }
    })
    if (Object.keys(toSet).length > 0) {
      LS.set(toSet)
    }
  })

  chrome.contextMenus.create({
    title: 'GIF Scrubber',
    contexts: ['link', 'image', 'video'],
    id: 'gif-scrubber',
  })
})

chrome.contextMenus.onClicked.addListener(showContextMenu)
