export default function AutoFitContent({ children, className = '' }) {
  return (
    <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
