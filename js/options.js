(function() {

  let options = [
    'open-tabs',
    'auto-open',
    'auto-play',
    'loop-anim',
    'mouse-scrub',
  ];

  let backgroundColor = localStorage['background-color'];

  function pickColor(color) {
    backgroundColor = color;
  }

  function restoreOptions() {
    options.forEach((o) => {
      document.getElementById(o).checked = localStorage[o] === 'true'
    });
    document.forms.color[backgroundColor].checked = true;
  }

  function saveOptions() {
    options.forEach((o) => {
      localStorage[o] = document.getElementById(o).checked ? 'true' : 'false';
    });
    localStorage['background-color'] = backgroundColor;
    const status = document.getElementById('status');
    status.textContent = 'Options saved. Refresh player to see changes.';
    status.classList.remove('fade');
    setTimeout(() => { status.classList.add('fade'); }, 0);
  }

  document.getElementById('save-button').addEventListener('click', saveOptions);
  for (const input of document.getElementsByClassName('input-color')) {
    input.addEventListener('change', e => { pickColor(e.currentTarget.value) });
  }
  for (const input of document.getElementsByClassName('input-radio')) {
    input.addEventListener('change', e => { pickColor(e.currentTarget.dataset.color) });
  }
  window.addEventListener('load', restoreOptions);
})();
