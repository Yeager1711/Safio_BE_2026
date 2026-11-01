import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SIAChatMessage } from '../context/conversation-summary.service';
import { normalizeIntentText } from './intent-router.utils';
import { SafioIntent } from './intent-router.types';

@Injectable()
export class LlmIntentRouter {
    private readonly openRouterKey: string;
    private readonly groqKey: string;
    private readonly validIntents: SafioIntent[] = [
        'camera',
        'face-id',
        'fall-detection',
        'account',
        'troubleshooting',
        'architecture',
        'general',
    ];

    constructor(private readonly configService: ConfigService) {
        this.openRouterKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
        this.groqKey = this.configService.get<string>('GROQ_API_KEY') || '';
    }

    private normalize(value: string): string {
        return normalizeIntentText(value);
    }

public async detectByLLM(
                question: string,
                history: SIAChatMessage[] = []
        ): Promise<SafioIntent> {
                const recent = history
                        .slice(-8)
                        .map((m) => `${m.role === 'user' ? 'User' : 'SIA'}: ${m.content}`)
                        .join('\n');

                const prompt = `
Bạn là bộ phân loại intent cho trợ lý AI SIA của hệ thống Safio.

CHỈ trả về ĐÚNG 1 nhãn:

camera
face-id
fall-detection
account
troubleshooting
architecture
general

Không giải thích.
Không thêm dấu câu.
Không thêm markdown.
Không trả về nhiều nhãn.

==================================================
ĐỊNH NGHĨA INTENT
==================================================

architecture:
- Kiến trúc tổng thể của SIA hoặc Safio.
- Mô hình tổng thể hệ thống Safio.
- Cấu trúc SIA.
- System architecture.
- Architecture diagram tổng thể.
- Flowchart tổng thể SIA/Safio.
- Các câu như:
  "Vẽ sơ đồ SIA"
  "Cho tôi kiến trúc SIA"
  "Vẽ mô hình Safio"
  "Sơ đồ tổng thể Safio"

LƯU Ý:
Nếu người dùng yêu cầu sơ đồ của MỘT CHỨC NĂNG CỤ THỂ,
KHÔNG chọn architecture chỉ vì có chữ "sơ đồ".

camera:
- Camera.
- Camera IP.
- EZVIZ.
- IMOU.
- Kết nối camera.
- Trạng thái camera.
- Camera online/offline.
- Quy trình hoặc sơ đồ riêng về camera.

face-id:
- Face ID của Safio.
- Khuôn mặt.
- Đăng ký khuôn mặt.
- Xác minh khuôn mặt.
- Nhận diện khuôn mặt.
- Sinh trắc học.
- Quy trình hoặc sơ đồ riêng về Face ID.

fall-detection:
- Té ngã.
- Fall Detection.
- Phát hiện té ngã.
- Mức cảnh báo.
- Cấp 1, cấp 2, cấp 3.
- Sự kiện té ngã.
- Lịch sử té ngã.
- Snapshot.
- Quy trình hoặc sơ đồ riêng về Fall Detection.

account:
- Tài khoản.
- Hồ sơ.
- Thông tin cá nhân.
- Thành viên.
- Gia đình.

troubleshooting:
- Lỗi.
- Không hoạt động.
- Không hiển thị.
- Không gửi.
- Không nhận được.
- Khắc phục sự cố.

general:
- Không thuộc các nhóm trên.

==================================================
QUY TẮC ƯU TIÊN
==================================================

1. Nếu nói về kiến trúc tổng thể SIA/Safio
   -> architecture

2. Nếu yêu cầu sơ đồ/quy trình riêng về Camera
   -> camera

3. Nếu yêu cầu sơ đồ/quy trình riêng về Face ID
   -> face-id

4. Nếu yêu cầu sơ đồ/quy trình riêng về Fall Detection
   -> fall-detection

5. Nếu người dùng vừa được SIA đề nghị trình bày bằng sơ đồ
   và câu hiện tại là xác nhận như:
   "Có"
   "Ừ"
   "Được"
   "OK"
   "Vẽ đi"
   "Cho xem đi"
   thì dùng ngữ cảnh gần nhất để xác định domain.

6. Không được tự chọn architecture chỉ vì câu có từ:
   "sơ đồ"
   "vẽ"
   "mô hình"

7. Nếu không chắc chắn -> general.

==================================================
LỊCH SỬ GẦN ĐÂY
==================================================

${recent || '(không có)'}

==================================================
CÂU HỎI HIỆN TẠI
==================================================

${question}
                `.trim();

                const messages = [
                        {
                                role: 'user' as const,
                                content: prompt,
                        },
                ];

                /** GROQ */
                if (this.groqKey) {
                        try {
                                const res = await axios.post(
                                        'https://api.groq.com/openai/v1/chat/completions',
                                        {
                                                model: 'llama-3.1-8b-instant',
                                                messages,
                                                temperature: 0,
                                                max_tokens: 20,
                                        },
                                        {
                                                timeout: 8000,
                                                headers: {
                                                        Authorization: `Bearer ${this.groqKey}`,
                                                        'Content-Type': 'application/json',
                                                },
                                        }
                                );

                                const raw = (res.data?.choices?.[0]?.message?.content || '')
                                        .trim()
                                        .toLowerCase();

                                if (this.validIntents.includes(raw as SafioIntent)) {
                                        console.log(`[Intent] LLM (Groq) → ${raw}`);

                                        return raw as SafioIntent;
                                }

                                console.warn(`[Intent] Groq returned invalid intent: "${raw}"`);
                        } catch (err: any) {
                                console.warn('[Intent] Groq classify failed:', err?.message);
                        }
                }

                /**
                 * ---------------------------------------------------------
                 * OPENROUTER FALLBACK
                 * ---------------------------------------------------------
                 */
                if (this.openRouterKey) {
                        try {
                                const res = await axios.post(
                                        'https://openrouter.ai/api/v1/chat/completions',
                                        {
                                                model: 'openrouter/free',
                                                messages,
                                                temperature: 0,
                                                max_tokens: 20,
                                        },
                                        {
                                                timeout: 10000,
                                                headers: {
                                                        Authorization: `Bearer ${this.openRouterKey}`,
                                                        'Content-Type': 'application/json',
                                                        'HTTP-Referer': 'https://safio.vn',
                                                        'X-Title': 'SIA-Intent',
                                                },
                                        }
                                );

                                const raw = (res.data?.choices?.[0]?.message?.content || '')
                                        .trim()
                                        .toLowerCase();

                                if (this.validIntents.includes(raw as SafioIntent)) {
                                        console.log(`[Intent] LLM (OpenRouter) → ${raw}`);

                                        return raw as SafioIntent;
                                }

                                console.warn(
                                        `[Intent] OpenRouter returned invalid intent: "${raw}"`
                                );
                        } catch (err: any) {
                                console.warn('[Intent] OpenRouter classify failed:', err?.message);
                        }
                }

                console.warn('[Intent] LLM classify failed → fallback general');

                return 'general';
        }
}
