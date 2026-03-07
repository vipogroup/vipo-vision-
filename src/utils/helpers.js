export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(dateString) {
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
}

export function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function getStatusColor(status) {
  switch (status) {
    case 'online':
      return 'text-emerald-400';
    case 'offline':
      return 'text-red-400';
    case 'recording':
      return 'text-blue-400';
    case 'motion':
      return 'text-amber-400';
    default:
      return 'text-slate-400';
  }
}

export function getStatusBg(status) {
  switch (status) {
    case 'online':
      return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
    case 'offline':
      return 'bg-red-400/10 text-red-400 border-red-400/20';
    case 'recording':
      return 'bg-blue-400/10 text-blue-400 border-blue-400/20';
    case 'motion':
      return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
    default:
      return 'bg-slate-400/10 text-slate-400 border-slate-400/20';
  }
}

export function getSeverityColor(severity) {
  switch (severity) {
    case 'critical':
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'warning':
      return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'info':
      return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    default:
      return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  }
}
