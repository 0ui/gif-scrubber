import $ from 'jquery'
import { defaults } from './eventPage'
const LS = chrome.storage.local;

(async function() {

  const options = await LS.get(Object.keys(defaults));
  Object.entries(options).forEach(async ([key, val]) => {
    const elem = document.getElementById(key);
    if (elem)
      elem.checked = val;
  });
  document.forms['options-form']['background-color'].value = options['background-color'];

  function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(document.forms['options-form']);
    Object.entries(options).map(([key, val_]) => {
      const val = formData.get(key);
      const elem = document.querySelector(`input[type=checkbox][name=${key}]`)
      if (elem) {
        const isChecked = val === 'on';
        LS.set({ [key]: isChecked });
      } else {
        LS.set({ [key]: val });
      }
    });
    $('#status').text('Options saved. Refresh player to see changes.').show().delay(1400).fadeOut(400);
  }

  $('#options-form').on('submit', handleSubmit);
})();
