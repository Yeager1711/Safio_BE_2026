const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface DateContext {
        timeZone: string;
        currentDate: string;
        currentDateTime: string;
        currentTime: string;
        dayOfWeek: string;
        tomorrow: string;
        yesterday: string;
}

function getDateParts(date: Date): {
        year: number;
        month: number;
        day: number;
} {
        const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: TIME_ZONE,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
        }).formatToParts(date);

        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

        return {
                year: Number(values.year),
                month: Number(values.month),
                day: Number(values.day),
        };
}

function formatDate(date: Date): string {
        const { year, month, day } = getDateParts(date);

        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function getVietnamDate(date: Date): Date {
        const parts = getDateParts(date);

        return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDays(date: Date, days: number): Date {
        const result = new Date(date);

        result.setUTCDate(result.getUTCDate() + days);

        return result;
}

/**
 * Luôn lấy thời gian thực tế theo múi giờ Asia/Ho_Chi_Minh.
 * Không phụ thuộc kiến thức của model.
 */
export function getDateContext(now = new Date()): DateContext {
        const currentDate = getVietnamDate(now);

        const currentTime = new Intl.DateTimeFormat('vi-VN', {
                timeZone: TIME_ZONE,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hourCycle: 'h23',
        }).format(now);

        const dayOfWeek = new Intl.DateTimeFormat('vi-VN', {
                timeZone: TIME_ZONE,
                weekday: 'long',
        }).format(now);

        return {
                timeZone: TIME_ZONE,
                currentDate: formatDate(now), // dd/mm/yyyy
                currentDateTime: new Intl.DateTimeFormat('vi-VN', {
                        timeZone: TIME_ZONE,
                        dateStyle: 'full',
                        timeStyle: 'medium',
                }).format(now),
                currentTime,
                dayOfWeek,
                tomorrow: formatDate(addDays(currentDate, 1)),
                yesterday: formatDate(addDays(currentDate, -1)),
        };
}

export function buildDateContextPrompt(): string {
        const date = getDateContext();

        return `
### NGÀY GIỜ THỰC TẾ

- Ngày hiện tại: ${date.currentDate}
- Thứ: ${date.dayOfWeek}
- Giờ hiện tại: ${date.currentTime}
- Ngày giờ đầy đủ: ${date.currentDateTime}
- Ngày hôm qua: ${date.yesterday}
- Ngày mai: ${date.tomorrow}
- Múi giờ: ${date.timeZone}

QUY TẮC:
- Đây là ngày giờ thực tế do backend cung cấp.
- Không sử dụng ngày giờ từ kiến thức của mô hình để thay thế.
- Khi người dùng hỏi hôm nay, hôm qua, ngày mai hoặc thời gian hiện tại,
  hãy dựa vào dữ liệu này.
- Không tự suy diễn rằng hôm nay có sự kiện nếu backend chưa xác nhận.
- Nếu dữ liệu sự kiện không có, phải nói rõ chưa có dữ liệu để xác nhận.
`.trim();
}
