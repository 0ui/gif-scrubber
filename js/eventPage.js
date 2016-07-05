// Set default options
if (typeof localStorage['open-tabs'] === 'undefined') localStorage['open-tabs'] = 'false';
if (typeof localStorage['auto-open'] === 'undefined') localStorage['auto-open'] = 'false';
if (typeof localStorage['auto-play'] === 'undefined') localStorage['auto-play'] = 'true';
if (typeof localStorage['loop-anim'] === 'undefined') localStorage['loop-anim'] = 'true';

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== 'scrubber') return false;
  let link = encodeURIComponent(info.linkUrl);
  let src = encodeURIComponent(info.srcUrl);
  let url = link.endsWith('.gif') || src === 'undefined' ? link : src;

  if (localStorage['open-tabs'] === 'true') {
    chrome.tabs.create({
      url: `popup.html#${url}`,
      selected: false,
    });
  } else {
    chrome.windows.create({
      'url': `popup.html#${url}`,
      'width': 470,
      'height': 430
    });
  }
});

chrome.runtime.onInstalled.addListener(function() {
  chrome.contextMenus.create({
    'title': 'GIF Scrubber', 
    'contexts': ['link','image','video'],
    'id': 'scrubber',
  });
});