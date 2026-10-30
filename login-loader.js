(function () {
  var form = document.getElementById('account-form');
  var button = document.getElementById('account-submit');
  var status = document.getElementById('auth-status');
  if (!form || !button || !status) return;
  form.addEventListener('submit', function (event) {
    if (form.getAttribute('data-ready') !== 'true') {
      event.preventDefault();
      status.textContent = '登录组件尚未准备完成，请稍候再提交。';
    }
  });
  if (!window.crypto || !window.crypto.subtle || !window.fetch) {
    status.textContent = '浏览器不支持安全登录，请用新版 Safari 或 Chrome 打开 HTTPS 网址。';
    return;
  }
  setTimeout(function () {
    if (form.getAttribute('data-ready') !== 'true' && !document.getElementById('account-screen').hidden) {
      status.textContent = '登录组件加载较慢，请检查网络，或刷新后重试。';
    }
  }, 12000);
}());
