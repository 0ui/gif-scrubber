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
    options.map((o) => {
      $('#' + o).prop('checked', localStorage[o] === 'true');
    });
    document.forms.color[backgroundColor].checked = true;
  }

  function saveOptions() {
    options.map((o) => {
      localStorage[o] = $('#' + o).is(':checked') ? 'true' : 'false';
    });
    localStorage['background-color'] = backgroundColor;
    $('#status').text('Options saved. Refresh player to see changes.').show().delay(1400).fadeOut(400);
  }

  $('#save-button').on('click', saveOptions);
  $('.input-color').on('change', function (e) { pickColor(this.value) });
  $('.input-radio').on('change', function (e) { pickColor(this.dataset.color) });
  $(window).on('load', restoreOptions);
})();
