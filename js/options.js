(function() {

  let options = [
    'open-tabs',
    'auto-open',
    'auto-play',
    'loop-anim',
  ];

  function restoreOptions() {
    options.map((o) => {
      $('#' + o).prop('checked', localStorage[o] === 'true');
    });
  }

  function saveOptions() {
    options.map((o) => {
      localStorage[o] = $('#' + o).is(':checked') ? 'true' : 'false';
    });
    $('#status').text('Options saved.').show().delay(700).fadeOut(400);
  }

  $('#save-button').on('click', saveOptions);
  $(window).on('load', restoreOptions);
})();
