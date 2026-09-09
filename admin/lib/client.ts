export async function api(path: string, data?: any, role = 'admin') {
  const token = localStorage.getItem('hg_' + role) || '';
  const r = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result: any = await r.json();
  if (!r.ok) {
    if (r.status === 401) localStorage.removeItem('hg_' + role);
    throw Error(result.error || '请求失败');
  }
  return result;
}
export const stateLabel = (s: string) =>
  ({
    confirmed: '预约成功',
    waitlisted: '候补中',
    checked: '已核销',
    cancelled: '已取消',
    published: '预约中',
    draft: '草稿',
    ended: '已结束',
  })[s] || s;
export function downloadCSV(rows: any[][], filename: string) {
  const clean = (v: any) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ['\ufeff' + rows.map((r) => r.map(clean).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8;' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
