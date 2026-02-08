export const formatDate = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}.${month}.${year}`;
};

export const formatDateTime = (date: string | Date | undefined | null): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const dateStr = formatDate(d);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `${dateStr} ${timeStr}`;
};
