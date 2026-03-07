import { getStatusBg } from '../utils/helpers';

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBg(status)}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'online'
            ? 'bg-emerald-400'
            : status === 'offline'
            ? 'bg-red-400'
            : status === 'recording'
            ? 'bg-blue-400 animate-pulse-dot'
            : status === 'motion'
            ? 'bg-amber-400 animate-pulse-dot'
            : 'bg-slate-400'
        }`}
      />
      <span className="capitalize">{status}</span>
    </span>
  );
}
