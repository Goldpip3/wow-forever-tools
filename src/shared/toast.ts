let timer: number | undefined;

export function toast(message: string, ms = 2000): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('toast--show');
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('toast--show'), ms);
}

export async function copyText(text: string, okMessage = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    // Clipboard API refuses on insecure origins; fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(okMessage);
    } catch {
      toast('Could not copy, select the text manually');
    }
    ta.remove();
  }
}
