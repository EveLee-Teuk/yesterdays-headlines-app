export type CalendarMetadata = {
  weekday: string;
  lunarMonth: string;
  lunarDay: string;
  lunarDate: string;
  cyclicalYear: string | null;
};

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/**
 * Calendar decoration for a Beijing civil date, using the runtime's Chinese
 * calendar. No network, guessed dates, auspicious-day rules or Gregorian fallback.
 * Unsupported/partial Intl implementations return null so the UI can omit it.
 */
export function getCalendarMetadata(date: string): CalendarMetadata | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1) return null;

  // Validate the Gregorian date before formatting: Date otherwise normalizes
  // impossible dates such as February 30. Noon avoids a device-local midnight.
  const validationDate = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(validationDate.getTime()) || validationDate.toISOString().slice(0, 10) !== date) return null;
  const beijingNoon = new Date(`${date}T12:00:00+08:00`);

  try {
    const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      calendar: 'chinese', numberingSystem: 'latn', timeZone: 'Asia/Shanghai',
      year: 'numeric', month: 'long', day: 'numeric',
    });
    if (formatter.resolvedOptions().calendar !== 'chinese' || typeof formatter.formatToParts !== 'function') return null;

    const parts = formatter.formatToParts(beijingNoon);
    const field = (type: string) => parts.find(part => part.type === type)?.value;
    const rawMonth = field('month')?.replace('閏', '闰').replace('臘', '腊');
    const monthParts = rawMonth?.match(/^(闰)?(正|一|二|三|四|五|六|七|八|九|十|十一|十二|冬|腊)月$/);
    if (!monthParts) return null;
    const monthAliases: Record<string, string> = { 一: '正', 十一: '冬', 十二: '腊' };
    const lunarMonth = `${monthParts[1] || ''}${monthAliases[monthParts[2]] || monthParts[2]}月`;
    const rawDay = field('day');
    if (!rawDay || !/^\d{1,2}$/.test(rawDay)) return null;
    const lunarDay = LUNAR_DAYS[Number(rawDay) - 1];
    if (!lunarDay) return null;

    const yearName = field('yearName');
    const cyclicalYear = yearName && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(yearName) ? yearName : null;
    return {
      weekday: WEEKDAYS[validationDate.getUTCDay()],
      lunarMonth,
      lunarDay,
      lunarDate: `${lunarMonth}${lunarDay}`,
      cyclicalYear,
    };
  } catch {
    return null;
  }
}
