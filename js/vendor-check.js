// If a library did not arrive from jsDelivr, load this site's own copy (same file, same SRI hash).
(function () {
  var need = [
    ['maplibregl', 'vendor/maplibre-gl.js', 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj'],
    ['h3', 'vendor/h3-js.umd.js', 'sha384-nKUDlg+fT0U/eEt4KWP9n034kLe/eVj6k7CVjbu6qfRhJdEyinlGajS9+9AU+UZ5'],
    ['deck', 'vendor/deck.gl.min.js', 'sha384-tEG529toczQRv/bqd2PyHy5vTO49FMjQri0c1oB44gSkYiNouZz8L9yNTVx0YGl+'],
  ];
  for (var i = 0; i < need.length; i++) {
    if (!window[need[i][0]]) document.write('<script src="' + need[i][1] + '" integrity="' + need[i][2] + '"><\/script>');
  }
})();
