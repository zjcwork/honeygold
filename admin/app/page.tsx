'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  Ticket,
  Users,
  ScanLine,
  Settings,
  ArrowUpRight,
  Plus,
  Calendar,
  MonitorSmartphone,
  Sparkles,
  Download,
  Search,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api, loginDemo, stateLabel, downloadCSV } from '@/lib/client';
import Dashboard from './dashboard';
const nav = [
  ['工作台', LayoutDashboard],
  ['活动管理', CalendarDays],
  ['预约管理', Ticket],
  ['场次与名额', Calendar],
  ['会员管理', Users],
  ['现场核销', ScanLine],
] as const;
const initial = { events: [], bookings: [], slots: [], users: [], demo: true };
export function Badge({ value }: any) {
  return (
    <span
      className={
        'status ' +
        (value === 'waitlisted'
          ? 'badge-wait'
          : ['cancelled', 'ended', 'draft'].includes(value)
            ? 'badge-cancel'
            : '')
      }
    >
      {stateLabel(value)}
    </span>
  );
}
export function BookingTable({ rows, onDetail }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {['预约人', '活动 / 体验', '预约场次', '预约状态', '操作'].map(
              (x) => (
                <th key={x}>{x}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>
                {r.name}
                <small>
                  {r.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
                </small>
              </td>
              <td>
                {r.title}
                <small>{r.experience}</small>
              </td>
              <td>
                {r.date}
                <small>{r.time}</small>
              </td>
              <td>
                <Badge value={r.status} />
              </td>
              <td>
                {onDetail ? (
                  <Button variant="ghost" onClick={() => onDetail(r)}>
                    详情
                  </Button>
                ) : (
                  <a href="/?view=预约管理">查看</a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <Ticket size={30} />
          <h3>暂无预约记录</h3>
          <p>完成活动预约后，报名名单将在这里显示。</p>
          <a href="/mini">体验活动预约 →</a>
        </div>
      )}
    </div>
  );
}
export default function Home() {
  const [view, setView] = useState('工作台'),
    [data, setData] = useState<any>(initial),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [eventFilter, setEventFilter] = useState('all'),
    [modal, setModal] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [ready, setReady] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false),
    [key, setKey] = useState('');
  const refresh = useCallback(async () => {
    setData(await api('admin/overview'));
    setReady(true);
    setNeedsLogin(false);
  }, []);
  useEffect(() => {
    setView(new URLSearchParams(location.search).get('view') || '工作台');
    (async () => {
      try {
        const c = await api('config');
        if (!localStorage.getItem('hg_admin')) {
          if (c.demo) await loginDemo('admin');
          else {
            setNeedsLogin(true);
            return;
          }
        }
        await refresh();
      } catch (e: any) {
        setError(e.message);
        setNeedsLogin(true);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = useCallback((v: string) => {
    setView(v);
    setQuery('');
    setFilter('all');
    setEventFilter('all');
    history.replaceState(null, '', '/?view=' + encodeURIComponent(v));
  }, []);
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: 'navigate_honeygold_admin',
          description: '打开蜜金运营后台的指定管理页面，不修改数据',
          inputSchema: {
            type: 'object',
            properties: {
              view: { type: 'string', enum: nav.map((n) => n[0]) },
            },
            required: ['view'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: any) => {
            if (!nav.some((n) => n[0] === input.view)) throw Error('无效页面');
            navigate(input.view);
            return { view: input.view };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [navigate]);
  async function act(path: string, body: any, message: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api(path, body);
      await refresh();
      setModal(null);
      setToast(message);
      return result;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function createEvent() {
    setModal({
      type: 'event',
      value: {
        title: '',
        subtitle: 'HONEY GOLD CLUB',
        location: '',
        start_date: '2026-10-15',
        end_date: '2026-10-18',
        description: '',
      },
    });
  }
  const reservations = data.bookings.filter(
    (b: any) =>
      (filter === 'all' || b.status === filter) &&
      (eventFilter === 'all' || b.event_id === eventFilter) &&
      (b.name + b.phone + b.title).includes(query),
  );
  const slots = data.slots.filter(
    (s: any) =>
      (eventFilter === 'all' || s.event_id === eventFilter) &&
      (s.experience + s.date + s.time).includes(query),
  );
  const metrics = [
    [
      '活动总数',
      data.events.length,
      `${data.events.filter((e: any) => e.status === 'published').length} 场开放预约`,
      CalendarDays,
    ],
    [
      '累计预约',
      data.bookings.filter((b: any) => b.status !== 'cancelled').length,
      '包含已确认、候补与已核销',
      Ticket,
    ],
    [
      '候补人数',
      data.bookings.filter((b: any) => b.status === 'waitlisted').length,
      '名额释放后自动递补',
      Users,
    ],
    [
      '已核销人数',
      data.bookings.filter((b: any) => b.status === 'checked').length,
      '现场入场记录',
      ScanLine,
    ],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          honey<span>gold</span>
          <small>蜜金 · 活动管理平台</small>
        </div>
        <div className="workspace">
          <span className="workspace-icon">H</span>
          <div>
            HONEY GOLD CLUB<small>品牌运营工作空间</small>
          </div>
        </div>
        <div className="nav-label">运营管理</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              aria-label={name}
              className={view === name ? 'active' : ''}
              onClick={() => navigate(name)}
              key={name}
            >
              <Icon size={19} />
              {name}
              {name === '活动管理' && (
                <span className="nav-count">{data.events.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <Sparkles size={18} />
            <p>
              每一次相遇，都值得期待<small>让美好体验，从预约开始。</small>
            </p>
          </div>
          <button onClick={() => navigate('平台设置')}>
            <Settings size={18} />
            平台设置
          </button>
          <div className="profile">
            <span>蜜</span>
            <div>
              蜜金运营团队<small>管理员</small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            运营管理 <span>/</span> <b>{view}</b>
          </div>
          <div className="top-right">
            {data.demo && <span className="demo-tag">演示工作区</span>}
            <a href="/mini">
              <MonitorSmartphone size={16} />
              小程序预览
              <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === '工作台'
                  ? 'WORKSPACE OVERVIEW'
                  : 'HONEY GOLD OPERATIONS'}
              </div>
              <h1>
                {view === '工作台' ? '每一场美好，从这里开始' : view}
                <span>✦</span>
              </h1>
              <p>
                {
                  (
                    {
                      工作台: '欢迎回来，蜜金运营团队。一起为下一次相遇做好准备。',
                      活动管理: '策划每一次相遇，让品牌体验有序发生。',
                      预约管理: '每一份预约，都是一份值得认真回应的期待。',
                      场次与名额: '安排体验场次，实时掌握预约与候补情况。',
                      会员管理: '记录每位嘉宾与蜜金的美好相遇。',
                      现场核销: '核验专属入场凭证，欢迎嘉宾登岛。',
                      平台设置: '管理工作空间，查看服务接入状态。',
                    } as any
                  )[view]
                }
              </p>
            </div>
            {['工作台', '活动管理'].includes(view) && (
              <Button
                className="primary"
                onClick={createEvent}
                disabled={!ready}
              >
                <Plus />
                创建活动
              </Button>
            )}
            {view === '场次与名额' && (
              <Button
                className="primary"
                onClick={() =>
                  setModal({
                    type: 'slot',
                    value: {
                      eventId: data.events[0]?.id,
                      experience: '鎏金美甲 Beauty Bar',
                      date: data.events[0]?.start_date || '',
                      time: '10:30',
                      capacity: 2,
                    },
                  })
                }
                disabled={!data.events.length}
              >
                <Plus />
                添加场次
              </Button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
              <Button variant="ghost" onClick={() => setError('')}>
                关闭
              </Button>
            </div>
          )}
          {needsLogin ? (
            <section className="panel scan-box">
              <h2>登录运营后台</h2>
              <p>请输入管理员密钥。</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const r = await api('auth/admin', { key });
                    localStorage.setItem('hg_admin', r.token);
                    await refresh();
                    setError('');
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <Input
                  type="password"
                  aria-label="管理员密钥"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  required
                />
                <Button type="submit" className="primary">
                  登录
                </Button>
              </form>
            </section>
          ) : !ready ? (
            <div className="empty">正在读取工作空间…</div>
          ) : (
            <>
              {view === '工作台' && (
                <>
                  <div className="stats">
                    {metrics.map(([label, value, hint, Icon]: any) => (
                      <div className="stat" key={label}>
                        <div>
                          {label}
                          <Icon size={19} />
                        </div>
                        <strong>
                          {value}
                          <small>{label === '活动总数' ? '场' : '人'}</small>
                        </strong>
                        <p>
                          <span className="tiny-dot" />
                          {hint}
                        </p>
                      </div>
                    ))}
                  </div>
                  <Dashboard data={data} navigate={navigate} />
                </>
              )}
              {view === '活动管理' && (
                <>
                  <div className="toolbar">
                    <div className="tabs">
                      {[
                        ['all', '全部活动'],
                        ['published', '预约中'],
                        ['draft', '草稿'],
                        ['ended', '已结束'],
                      ].map(([v, t]) => (
                        <button
                          className={filter === v ? 'selected' : ''}
                          onClick={() => setFilter(v)}
                          key={v}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <Input
                      aria-label="搜索活动"
                      placeholder="搜索活动名称"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="search-input"
                    />
                  </div>
                  <div className="panel data-panel">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>活动信息</th>
                            <th>活动时间</th>
                            <th>状态</th>
                            <th>场次 / 预约</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.events
                            .filter(
                              (e: any) =>
                                (filter === 'all' || e.status === filter) &&
                                e.title.includes(query),
                            )
                            .map((e: any) => (
                              <tr key={e.id}>
                                <td>
                                  <b>{e.title}</b>
                                  <small>{e.location}</small>
                                </td>
                                <td>
                                  {e.start_date}
                                  <small>至 {e.end_date}</small>
                                </td>
                                <td>
                                  <Badge value={e.status} />
                                </td>
                                <td>
                                  {
                                    data.slots.filter(
                                      (s: any) => s.event_id === e.id,
                                    ).length
                                  }{' '}
                                  场次
                                  <small>
                                    {
                                      data.bookings.filter(
                                        (b: any) =>
                                          b.event_id === e.id &&
                                          b.status !== 'cancelled',
                                      ).length
                                    }{' '}
                                    人预约
                                  </small>
                                </td>
                                <td>
                                  <div className="actions">
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        setModal({ type: 'event', value: e })
                                      }
                                    >
                                      编辑
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() => {
                                        navigate('场次与名额');
                                        setEventFilter(e.id);
                                      }}
                                    >
                                      场次
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setModal({
                                          type: 'confirm',
                                          title:
                                            e.status === 'published'
                                              ? '下架活动'
                                              : '发布活动',
                                          description:
                                            e.status === 'published'
                                              ? '下架后停止新预约，已有预约记录仍保留。'
                                              : '发布后，嘉宾即可通过小程序预约活动。',
                                          path: 'admin/event-status',
                                          body: {
                                            id: e.id,
                                            status:
                                              e.status === 'published'
                                                ? 'draft'
                                                : 'published',
                                          },
                                        })
                                      }
                                    >
                                      {e.status === 'published'
                                        ? '下架'
                                        : '发布'}
                                    </Button>
                                    {e.status !== 'ended' && (
                                      <Button
                                        variant="ghost"
                                        onClick={() =>
                                          setModal({
                                            type: 'confirm',
                                            title: '结束活动',
                                            description:
                                              '结束后活动将进入历史列表，停止接受新预约。',
                                            path: 'admin/event-status',
                                            body: { id: e.id, status: 'ended' },
                                          })
                                        }
                                      >
                                        结束
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              {view === '预约管理' && (
                <>
                  <div className="toolbar">
                    <Input
                      aria-label="搜索预约"
                      className="search-input"
                      placeholder="搜索姓名、手机号或活动"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="筛选活动"
                      className="search-input"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      <option value="all">全部活动</option>
                      {data.events.map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadCSV(
                          [
                            [
                              '姓名',
                              '手机',
                              '活动',
                              '体验',
                              '日期',
                              '时间',
                              '状态',
                            ],
                            ...reservations.map((r: any) => [
                              r.name,
                              r.phone,
                              r.title,
                              r.experience,
                              r.date,
                              r.time,
                              stateLabel(r.status),
                            ]),
                          ],
                          '蜜金预约名单.csv',
                        )
                      }
                    >
                      <Download />
                      导出名单
                    </Button>
                  </div>
                  <div className="toolbar tabs">
                    {[
                      ['all', '全部预约'],
                      ['confirmed', '预约成功'],
                      ['waitlisted', '候补中'],
                      ['checked', '已核销'],
                      ['cancelled', '已取消'],
                    ].map(([v, t]) => (
                      <button
                        key={v}
                        className={filter === v ? 'selected' : ''}
                        onClick={() => setFilter(v)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <BookingTable
                      rows={reservations}
                      onDetail={(b: any) =>
                        setModal({ type: 'booking', value: b })
                      }
                    />
                  </section>
                </>
              )}
              {view === '场次与名额' && (
                <>
                  <div className="toolbar">
                    <select
                      aria-label="选择活动"
                      className="search-input"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      <option value="all">全部活动</option>
                      {data.events.map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="搜索场次"
                      className="search-input"
                      placeholder="搜索日期、时间或体验"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span className="muted">共 {slots.length} 场</span>
                  </div>
                  <section className="panel">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {[
                              '活动 / 体验',
                              '日期',
                              '时间',
                              '名额使用',
                              '候补',
                              '操作',
                            ].map((t) => (
                              <th key={t}>{t}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((s: any) => (
                            <tr key={s.id}>
                              <td>
                                {s.experience}
                                <small>{s.title}</small>
                              </td>
                              <td>{s.date}</td>
                              <td>{s.time}</td>
                              <td>
                                {s.booked} / {s.capacity}
                                <progress
                                  style={{
                                    display: 'block',
                                    width: 80,
                                    height: 4,
                                    accentColor: '#779377',
                                    marginTop: 8,
                                  }}
                                  value={s.booked}
                                  max={s.capacity}
                                />
                              </td>
                              <td>{s.waiting} 人</td>
                              <td>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setModal({ type: 'slot', value: s })
                                  }
                                >
                                  调整名额
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!slots.length && (
                        <div className="empty">
                          暂无场次，请添加体验时间与名额。
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === '会员管理' && (
                <>
                  <div className="toolbar">
                    <Input
                      aria-label="搜索会员"
                      className="search-input"
                      placeholder="搜索姓名或手机号"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span>共 {data.users.length} 位会员</span>
                  </div>
                  <section className="panel">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>会员</th>
                            <th>手机号</th>
                            <th>累计预约</th>
                            <th>加入时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.users
                            .filter((u: any) =>
                              ((u.name || '') + (u.phone || '')).includes(
                                query,
                              ),
                            )
                            .map((u: any) => (
                              <tr key={u.id}>
                                <td>{u.name || '未填写'}</td>
                                <td>
                                  {u.phone?.replace(
                                    /(\d{3})\d{4}(\d{4})/,
                                    '$1****$2',
                                  ) || '未授权'}
                                </td>
                                <td>{u.bookings} 次</td>
                                <td>{u.created_at.slice(0, 10)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!data.users.length && (
                        <div className="empty">
                          暂无会员，用户登录小程序后会自动建立会员记录。
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === '现场核销' && (
                <section className="panel scan-box">
                  <ScanLine size={48} />
                  <h2>欢迎嘉宾登岛</h2>
                  <p>使用扫码枪扫描二维码，或粘贴完整入场码。</p>
                  {data.demo && (
                    <div className="alert">
                      演示模式可提前核销；正式模式校验到场时间。
                    </div>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const r = await act(
                        'admin/checkin',
                        { code: query },
                        '核销成功，欢迎登岛',
                      );
                      if (r) {
                        setQuery('');
                        setModal({ type: 'booking', value: r });
                      }
                    }}
                  >
                    <Input
                      aria-label="入场凭证码"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="HG: 入场凭证码"
                      required
                    />
                    <Button className="primary" type="submit" disabled={busy}>
                      确认核销
                    </Button>
                  </form>
                </section>
              )}
              {view === '平台设置' && (
                <div className="settings-grid">
                  <section className="panel">
                    <h2>工作空间</h2>
                    <div className="info-line">
                      <span>品牌</span>
                      <b>HONEY GOLD · 蜜金</b>
                    </div>
                    <div className="info-line">
                      <span>运行环境</span>
                      <b>{data.demo ? '私有演示工作区' : '正式运营模式'}</b>
                    </div>
                    <div className="info-line">
                      <span>修改 / 取消截止</span>
                      <b>场次开始前 8 小时</b>
                    </div>
                    <div className="info-line">
                      <span>候补机制</span>
                      <b>按报名顺序自动递补</b>
                    </div>
                    <Button
                      variant="outline"
                      style={{ marginTop: 20 }}
                      onClick={() => {
                        localStorage.removeItem('hg_admin');
                        setNeedsLogin(true);
                        setReady(false);
                      }}
                    >
                      <LogOut />
                      退出登录
                    </Button>
                  </section>
                  <section className="panel">
                    <h2>微信小程序</h2>
                    <div className="info-line">
                      <span>用户端</span>
                      <a href="/mini">打开预约预览 ↗</a>
                    </div>
                    <div className="info-line">
                      <span>手机号授权</span>
                      <b>{data.demo ? '演示填写' : '微信授权验证'}</b>
                    </div>
                    <div className="info-line">
                      <span>订阅通知</span>
                      <b>
                        {
                          (data.notifications || []).filter(
                            (n: any) => n.status === 'sent',
                          ).length
                        }{' '}
                        条已发送
                      </b>
                    </div>
                    <div className="info-line">
                      <span>待发送 / 失败</span>
                      <b>
                        {
                          (data.notifications || []).filter(
                            (n: any) => n.status === 'pending',
                          ).length
                        }{' '}
                        /{' '}
                        {
                          (data.notifications || []).filter(
                            (n: any) => n.status === 'failed',
                          ).length
                        }
                      </b>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy || data.demo}
                      onClick={() =>
                        act('admin/notifications', {}, '已处理待发送与失败通知')
                      }
                    >
                      发送待处理通知
                    </Button>
                    <p
                      style={{
                        lineHeight: 1.9,
                        color: '#879487',
                        fontSize: 13,
                      }}
                    >
                      正式上线需配置品牌 AppID、AppSecret、合法 HTTPS
                      域名与订阅消息模板。演示数据不代表实际活动报名。隐私条款与活动地址须由品牌确认。
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            HONEY GOLD CLUB <span>用心相遇 · 从容赴约</span>
            <small>© 2026 蜜金</small>
          </footer>
        </div>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(o) => !o && !busy && setModal(null)}
      >
        <DialogContent className="dialog-large">
          <DialogTitle>
            {modal?.type === 'event'
              ? modal.value.id
                ? '编辑活动'
                : '创建活动'
              : modal?.type === 'slot'
                ? modal.value.id
                  ? '调整场次名额'
                  : '添加体验场次'
                : modal?.type === 'booking'
                  ? '预约详情'
                  : modal?.title || ''}
          </DialogTitle>
          <DialogDescription>
            {modal?.type === 'confirm'
              ? modal.description
              : modal?.type === 'event'
                ? '填写活动信息，创建后可配置场次并发布。'
                : modal?.type === 'slot'
                  ? '增加名额后，候补嘉宾将按报名顺序自动递补。'
                  : 'HONEY GOLD CLUB'}
          </DialogDescription>
          {error && <div className="alert">{error}</div>}
          {modal?.type === 'event' && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                act('admin/events', { ...f, id: modal.value.id }, '活动已保存');
              }}
            >
              {[
                ['title', '活动名称', 'text'],
                ['subtitle', '英文副标题', 'text'],
                ['location', '活动地点', 'text'],
                ['start_date', '开始日期', 'date'],
                ['end_date', '结束日期', 'date'],
              ].map(([k, label, type]) => (
                <label className="field" key={k}>
                  {label}
                  <Input
                    name={k}
                    type={type}
                    defaultValue={modal.value[k]}
                    required
                    maxLength={k === 'title' ? 100 : 200}
                  />
                </label>
              ))}
              <label className="field">
                活动介绍
                <textarea
                  name="description"
                  defaultValue={modal.value.description}
                  required
                  maxLength={8000}
                />
              </label>
              <Button type="submit" disabled={busy} className="primary">
                {busy ? '保存中…' : '保存活动'}
              </Button>
            </form>
          )}
          {modal?.type === 'slot' && (
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                act(
                  'admin/slots',
                  { ...f, id: modal.value.id, capacity: Number(f.capacity) },
                  '场次已保存',
                );
              }}
            >
              {!modal.value.id && (
                <>
                  <label className="field">
                    活动
                    <select name="eventId" defaultValue={modal.value.eventId}>
                      {data.events.map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    体验
                    <select name="experience">
                      {[
                        '鎏金美甲 Beauty Bar',
                        '微醺特调 Gold Bar',
                        '仅登岛参观',
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    日期
                    <Input
                      name="date"
                      type="date"
                      defaultValue={modal.value.date}
                      required
                    />
                  </label>
                  <label className="field">
                    时间
                    <Input
                      name="time"
                      type="time"
                      defaultValue={modal.value.time}
                      required
                    />
                  </label>
                </>
              )}
              <label className="field">
                总名额
                <Input
                  type="number"
                  name="capacity"
                  defaultValue={modal.value.capacity}
                  min={Math.max(1, modal.value.booked || 0)}
                  max={10000}
                  required
                />
              </label>
              <Button type="submit" disabled={busy} className="primary">
                保存名额
              </Button>
            </form>
          )}
          {modal?.type === 'booking' && (
            <div>
              {[
                ['预约人', modal.value.name],
                ['手机号', modal.value.phone],
                ['活动', modal.value.title],
                ['体验', modal.value.experience],
                ['时间', modal.value.date + ' ' + modal.value.time],
                ['状态', stateLabel(modal.value.status)],
                ['拍摄授权', modal.value.photo_consent ? '已同意' : '未同意'],
                ['核销时间', modal.value.checked_at || '未核销'],
              ].map(([a, b]) => (
                <div className="info-line" key={a}>
                  <span>{a}</span>
                  <b>{b}</b>
                </div>
              ))}
            </div>
          )}
          {modal?.type === 'confirm' && (
            <div className="actions">
              <Button
                variant="outline"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                返回
              </Button>
              <Button
                onClick={() => act(modal.path, modal.body, '操作成功')}
                disabled={busy}
              >
                确认{modal.title}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
