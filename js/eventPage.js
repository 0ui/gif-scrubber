const LS = chrome.storage.local;

function showContextMenu(info, tab) {
  if (info.menuItemId !== 'gif-scrubber') return false;
  let link = encodeURIComponent(info.linkUrl);
  let src = encodeURIComponent(info.srcUrl);
  let urls = JSON.stringify([link, src]);

  if (LS.get('open-tabs') === 'true') {
    chrome.tabs.create({
      url: `popup.html#${urls}`,
      active: false,
    });
  } else {
    chrome.windows.create({
      'url': `popup.html#${urls}`,
      'width': 470,
      'height': 430
    });
  }
}

export const defaults = {
  'open-tabs': false,
  'auto-open': false,
  'auto-play': true,
  'loop-anim': true,
  'mouse-scrub': false,
  'background-color': 'dark',
};

// Set default options
LS.get(Object.keys(defaults)).then(options => {
  Object.entries(defaults).forEach(([key, val]) => {
    if (typeof options[key] === 'undefined')
      LS.set({ [key]: val });
  })

  chrome.contextMenus.create({
    'title': 'GIF Scrubber', 
    'contexts': ['link','image','video'],
    'id': 'gif-scrubber',
  });

  chrome.contextMenus.onClicked.addListener(showContextMenu);
});
