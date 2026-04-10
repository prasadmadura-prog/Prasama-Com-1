const LK_LOCALE = 'en-GB';
const LK_TZ = 'Asia/Colombo'; // UTC+5:30 — Sri Lanka Standard Time

export const formatDate = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    // Use Intl.DateTimeFormat to always render in Sri Lanka timezone
    const parts = new Intl.DateTimeFormat(LK_LOCALE, {
        timeZone: LK_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')}`;
};

export const formatDateTime = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const dateStr = formatDate(d);
    const timeStr = d.toLocaleTimeString(LK_LOCALE, {
        timeZone: LK_TZ,
        hour: '2-digit',
        minute: '2-digit'
    });

    return `${dateStr} ${timeStr}`;
};
