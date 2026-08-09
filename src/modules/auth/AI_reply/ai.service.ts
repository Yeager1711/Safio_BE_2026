import {
        BadRequestException,
        ForbiddenException,
        HttpException,
        HttpStatus,
        Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, ChatSession } from '@google/generative-ai';
import axios from 'axios';

@Injectable()
export class AI_Service {
        private readonly genAI: GoogleGenerativeAI;
        private readonly openRouterKey: string;

        private readonly BASE_PROMPT: string;

        private userChatSessions = new Map<string, { session: ChatSession; lastActive: Date }>();

        constructor(private readonly configService: ConfigService) {
                const apiKey = this.configService.get<string>('GEMINI_API_KEY');
                if (!apiKey) {
                        throw new Error('GEMINI_API_KEY is not defined in .env');
                }

                this.openRouterKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
                this.genAI = new GoogleGenerativeAI(apiKey);
                console.log('Gemini SDK:', require('@google/generative-ai/package.json').version);

                
                // ================== BASE PROMPT CHO Safio ==================
                this.BASE_PROMPT = `
                        Bạn là Safio — trợ lý thông minh của hệ thống Safio.

                        Nhiệm vụ chính:
                        - Hỗ trợ người dùng về hệ thống Safio: camera AI, phát hiện té ngã, cảnh báo thời gian thực.
                        - Giải thích cách bảo vệ người thân (người cao tuổi, bệnh nhân, người sống một mình).
                        - Hướng dẫn sử dụng thiết bị, quản lý tài khoản, xử lý sự cố.
                        - Tư vấn về an toàn và chăm sóc người thân.

                        Quy tắc bắt buộc:

                        1. Luôn trả lời chính xác, rõ ràng, hữu ích và ngắn gọn.
                        2. Ưu tiên trả lời trực tiếp vào trọng tâm, chỉ giải thích sâu khi người dùng yêu cầu.
                        3. Không bịa thông tin về tính năng chưa có của Safio.
                        4. Nếu không chắc chắn, hãy nói rõ "Hiện tại Safio chưa hỗ trợ tính năng này" hoặc "Mình sẽ kiểm tra và cập nhật cho bạn".
                        5. Chỉ giới thiệu bản thân là "Safio".
                        6. Nhấn mạnh các giá trị cốt lõi:
                        - Phát hiện té ngã tức thì bằng AI
                        - Cảnh báo thời gian thực cho người thân
                        - Bảo vệ người cao tuổi và người sống một mình
                        - Công nghệ hiện đại, dễ sử dụng, tôn trọng quyền riêng tư

                        7. Văn phong:
                        - Thân thiện, chuyên nghiệp, gần gũi
                        - Hiện đại, giống AI Assistant thực thụ
                        - Không dùng câu mở đầu kiểu "Dạ...", "Em xin...", "Xin chào...", "Rất vui..."

                        8. Luôn ưu tiên sự an toàn và lợi ích của người dùng.

                        Trả lời bằng tiếng Việt, tự nhiên và dễ hiểu.
                `.trim();
        }

        private async getOrCreateChatSession(userId: string): Promise<ChatSession> {
                const now = new Date();
                let userSession = this.userChatSessions.get(userId);

                // Xóa session cũ sau 60 phút
                if (
                        userSession &&
                        now.getTime() - userSession.lastActive.getTime() > 60 * 60 * 1000
                ) {
                        this.userChatSessions.delete(userId);
                        userSession = undefined;
                }

                if (!userSession) {
                        const model = this.genAI.getGenerativeModel({
                                model: 'gemini-1.5-flash',
                                generationConfig: { maxOutputTokens: 700, temperature: 0.35 },
                        });

                        const session = await model.startChat({
                                history: [
                                        { role: 'user', parts: [{ text: this.BASE_PROMPT }] },
                                        {
                                                role: 'model',
                                                parts: [
                                                        {
                                                                text: 'Safio đã sẵn sàng hỗ trợ bạn.',
                                                        },
                                                ],
                                        },
                                ],
                        });

                        userSession = { session, lastActive: now };
                        this.userChatSessions.set(userId, userSession);
                        return session;
                }

                userSession.lastActive = now;
                this.userChatSessions.set(userId, userSession);
                return userSession.session;
        }

        private async askOpenRouter(prompt: string): Promise<string> {
                if (!this.openRouterKey) throw new Error('OPENROUTER_API_KEY is missing');

                const models = [
                        'openrouter/free',
                        'nvidia/nemotron-3-ultra-550b-a55b:free',
                        'nvidia/nemotron-3-super-120b-a12b:free',
                ];

                for (const model of models) {
                        try {
                                const response = await axios.post(
                                        'https://openrouter.ai/api/v1/chat/completions',
                                        {
                                                model,
                                                messages: [
                                                        {
                                                                role: 'system',
                                                                content: this.BASE_PROMPT,
                                                        },
                                                        { role: 'user', content: prompt },
                                                ],
                                                temperature: 0.35,
                                                max_tokens: 700,
                                        },
                                        {
                                                timeout: 30000,
                                                headers: {
                                                        Authorization: `Bearer ${this.openRouterKey}`,
                                                        'Content-Type': 'application/json',
                                                        'HTTP-Referer': 'https://Safio.vn',
                                                        'X-Title': 'Safio',
                                                },
                                        }
                                );

                                const content = response.data?.choices?.[0]?.message?.content;
                                if (content) return content;
                        } catch (err: any) {
                                console.warn(`OpenRouter ${model} failed:`, err?.message);
                        }
                }

                throw new Error('Tất cả model OpenRouter đều tạm thời không khả dụng');
        }

        private async askGemini(userId: string, prompt: string): Promise<string> {
                const chatSession = await this.getOrCreateChatSession(userId);
                const result = await chatSession.sendMessage(prompt);
                return result.response.text();
        }

        private cleanResponse(text: string): string {
                return text
                        .replace(/^Safio.*?\n?/i, '')
                        .replace(/^Chào .*?\n?/i, '')
                        .replace(/^Dạ.*?\n?/i, '')
                        .replace(/\*\*/g, '\n•')
                        .replace(/\n•/g, '\n• ')
                        .trim();
        }

        async endChatSession(userId: string): Promise<void> {
                this.userChatSessions.delete(userId);
        }

        async answerAsSafioAI(
                userId: string,
                question: string,
                fullName?: string
        ): Promise<string> {
                console.log(`[Safio] User: ${userId} | Name: ${fullName} | Q: ${question}`);

                try {
                        const userDisplayName = fullName?.trim() || 'Bạn';

                        const enhancedPrompt = `
                        THÔNG TIN NGƯỜI DÙNG: ${userDisplayName}
                        CÂU HỎI: "${question}"

                        Trả lời trực tiếp, ngắn gọn, tập trung vào giải pháp và lợi ích của Safio:`;

                        let finalText: string;

                        try {
                                finalText = await this.askGemini(userId, enhancedPrompt);
                        } catch (error: any) {
                                console.error('========== GEMINI ERROR ==========');
                                console.error(error);

                                if (error.response?.data) {
                                        console.error(error.response.data);
                                }

                                console.error(error.stack);

                                console.error('==================================');

                                finalText = await this.askOpenRouter(enhancedPrompt);
                        }

                        finalText = this.cleanResponse(finalText);
                        return finalText || 'Safio đang bận, bạn thử lại sau một chút nhé!';
                } catch (error: any) {
                        console.error('AI_Service Error:', error);

                        if (error?.status === 429 || error?.message?.includes('Quota exceeded')) {
                                throw new BadRequestException({
                                        statusCode: 429,
                                        message: 'Hệ thống AI đang quá tải. Vui lòng thử lại sau 1-2 phút.',
                                });
                        }

                        throw new BadRequestException({
                                statusCode: 500,
                                message: 'Không thể kết nối với Safio. Vui lòng thử lại sau.',
                        });
                }
        }
}
