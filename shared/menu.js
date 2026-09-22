export function set_menu_open(menu_id, is_open) {
  const menu = document.getElementById(menu_id);
  const toggle_btn = document.getElementById('menuToggleBtn');
  if (!menu) return;

  if (!is_open) {
    if (menu.contains(document.activeElement)) {
      if (toggle_btn) {
        toggle_btn.focus();
      } else {
        document.body.focus();
      }
    }
    document.body.style.overflow = '';
  } else {
    document.body.style.overflow = 'hidden';
  }

  menu.classList.toggle('open', is_open);
  menu.setAttribute('aria-hidden', String(!is_open));

  if (is_open) {
    menu.removeAttribute('inert');
  } else {
    menu.setAttribute('inert', '');
  }

  if (toggle_btn) toggle_btn.setAttribute('aria-expanded', String(is_open));
}

export function bind_menu_toggle(toggle_btn, close_btn, menu_panel_id, on_close) {
  const panel = document.getElementById(menu_panel_id);

  if (toggle_btn) {
    toggle_btn.addEventListener('click', () => {
      const is_open = !!(panel && panel.classList.contains('open'));
      set_menu_open(menu_panel_id, !is_open);
    });
  }

  if (close_btn) {
    close_btn.addEventListener('click', () => {
      set_menu_open(menu_panel_id, false);
      if (typeof on_close === 'function') on_close();
    });
  }

  if (panel) {
    panel.addEventListener('click', (event) => {
      if (event.target === panel) set_menu_open(menu_panel_id, false);
    });
  }
}

export function go_home() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.pathname = url.pathname.replace(/\/[^\/]+\/[^\/]*$/, '/index.html');
    window.location.href = url.toString();
  } catch (e) {
    window.location.href = '../index.html';
  }
}

export function bind_show_home_button(btn) {
  if (btn) btn.addEventListener('click', go_home);
}
