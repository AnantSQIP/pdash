// Route-level loading skeleton for the Home dashboard — shown while the segment loads,
// so the first paint is a calm skeleton rather than a flash of empty/zero cards.
export default function HomeLoading() {
  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gray-100 animate-pulse hidden sm:block" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-gray-100 animate-pulse rounded" />
            <div className="h-3 w-32 bg-gray-100 animate-pulse rounded" />
          </div>
        </div>
        <div className="h-10 w-28 bg-gray-100 animate-pulse rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 pt-4 sm:pt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-[76px] animate-pulse" />
        ))}
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="columns-1 md:columns-2 2xl:columns-3 gap-4 sm:gap-6 [&>*]:mb-4 sm:[&>*]:mb-6 [&>*]:break-inside-avoid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-40 animate-pulse break-inside-avoid" />
          ))}
        </div>
      </div>
    </div>
  );
}
