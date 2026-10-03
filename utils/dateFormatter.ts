const LK_LOCALE = 'en-GB';
const LK_TZ = 'Asia/Colombo'; // UTC+5:30 — Sri Lanka Standard Time

export const formatDate = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    // Use Intl.DateTimeFormat to render MM/DD/YYYY in Sri Lanka timezone
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: LK_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('month')}/${get('day')}/${get('year')}`;
};

export const formatMMDDYYYY = (date: string | Date | number | undefined | null): string => {
    if (!date) return '';
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, d] = date.split('-');
        return `${m}/${d}/${y}`;
    }
    return formatDate(date);
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

export const formatTime = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    return d.toLocaleTimeString(LK_LOCALE, {
        timeZone: LK_TZ,
        hour: '2-digit',
        minute: '2-digit'
    });
};
