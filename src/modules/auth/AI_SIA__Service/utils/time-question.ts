// utils/time-question.ts

export function isTimeRelatedQuestion(question: string): boolean {
        const normalized = question
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();

        const patterns = [
                /\bhom nay\b/,
                /\bhom qua\b/,
                /\bngay mai\b/,
                /\bbay gio\b/,
                /\bhien tai\b/,
                /\bthoi gian\b/,
                /\bmay gio\b/,
                /\bbao gio\b/,
                /\bngay nao\b/,
                /\bngay gan nhat\b/,
                /\bngay truoc\b/,
                /\btu khi nao\b/,
                /\bden khi nao\b/,
                /\btrong bao lau\b/,
                /\bbao nhieu ngay\b/,
                /\bbao nhieu gio\b/,
                /\bthu may\b/,
                /\btoday\b/,
                /\byesterday\b/,
                /\btomorrow\b/,
                /\bcurrent time\b/,
        ];

        return patterns.some((pattern) => pattern.test(normalized));
}
