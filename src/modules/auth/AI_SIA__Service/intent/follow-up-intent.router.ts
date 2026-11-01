import { Injectable } from '@nestjs/common';
import { SIAChatMessage } from '../context/conversation-summary.service';
import { normalizeIntentText } from './intent-router.utils';
import { SafioIntent } from './intent-router.types';

@Injectable()
export class FollowUpIntentRouter {
        private readonly maxFollowUpLength = 100;
        private readonly historyLimit = 12;

        private normalize(value: string): string {
                return normalizeIntentText(value ?? '')
                        .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
        }

        private includesAny(value: string, signals: string[]): boolean {
                const normalized = this.normalize(value);
                return signals.some((signal) => {
                        const target = this.normalize(signal);
                        return target.length > 0 && ` ${normalized} `.includes(` ${target} `);
                });
        }

        private readonly genericFollowUps = [
                'giai thich them',
                'giai thich ro hon',
                'giai thich ro hon nua',
                'giai thich tiep',
                'noi them',
                'noi ro hon',
                'noi tiep di',
                'them di',
                'them nua',
                'them thong tin',
                'them chi tiet',
                'chi tiet hon',
                'chi tiet nua',
                'cu the hon',
                'lam ro',
                'lam ro hon',
                'cho biet them',
                'mo ta them',
                'phan tich them',
                'phan tich sau hon',
                'vi sao',
                'tai sao',
                'nhu the nao',
                'hoat dong ra sao',
                'con gi nua',
                'con nua khong',
                'tiep di',
                'tiep tuc',
                'tiep tuc di',
                'lam tiep',
                'thu tiep',
                'vi du di',
                'cho vi du',
                'vi du cu the',
                'cho minh vi du',
                'minh hoa them',
                'noi don gian hon',
                'giai thich de hieu hon',
                'rut gon lai',
                'tom tat lai',
                'so sanh them',
                'uu nhuoc diem thi sao',
                'ket qua thi sao',
                'sau do thi sao',
                'roi sao nua',
                'roi sao',
                'con no thi sao',
                'con cai do',
                'cai do',
                'no',
                'cai nay',
                'the con',
                'con sao nua',
                'ok',
                'oke',
                'okay',
                'duoc',
                'duoc nha',
                'duoc do',
                'uh',
                'u',
                'uhm',
                'um',
                'yes',
                'yes please',
                'sure',
                'go ahead',
                'continue',
                'tell me more',
                'explain more',
                'explain further',
                'more details',
                'in more detail',
                'give me an example',
                'show me more',
                'what else',
                'why',
                'how so',
                'and then',
                'what about that',
                'sounds good',
        ];

        private readonly continuationSignals = [
                'giai thich',
                'noi them',
                'chi tiet',
                'cu the',
                'lam ro',
                'phan tich',
                'minh hoa',
                'vi du',
                'so sanh',
                'tom tat',
                'mo ta them',
                'noi ro',
                'tiep tuc',
                'tiep theo',
                'hoat dong nhu the nao',
                'cach hoat dong',
                'tai sao',
                'vi sao',
                'the nao',
                'con ve',
                'con phan',
                'them thong tin',
                'them chi tiet',
                'ket qua',
                'nguyen nhan',
                'cach xu ly',
                'cach khac phuc',
                'cach thuc hien',
                'buoc tiep theo',
                'uu diem',
                'nhuoc diem',
                'tell me more',
                'explain',
                'elaborate',
                'continue',
                'what about',
                'how does it work',
                'why is that',
                'give an example',
        ];

        private readonly topicSwitchSignals = [
                'chuyen sang',
                'hoi ve',
                'noi ve',
                'con ve',
                'doi chu de',
                'chu de khac',
                'mot cau hoi khac',
                'cau hoi khac',
                'ngoai ra',
                'tien the',
                'bay gio hoi',
                'khong lien quan',
                'new topic',
                'different question',
                'switch to',
                'unrelated question',
                'instead',
        ];

        private readonly domainSignals: Record<Exclude<SafioIntent, 'general'>, string[]> = {
                'face-id': [
                        'face id',
                        'faceid',
                        'face-id',
                        'khuon mat',
                        'nhan dien khuon mat',
                        'xac minh khuon mat',
                        'dang ky khuon mat',
                        'sinh trac',
                        'xac thuc sinh trac',
                        'face recognition',
                        'facial recognition',
                        'face verification',
                        'face authentication',
                        'face scan',
                        'face embedding',
                        'embedding khuon mat',
                ],
                camera: [
                        'camera',
                        'camera ip',
                        'ip camera',
                        'ezviz',
                        'imou',
                        'rtsp',
                        'onvif',
                        'camera vision',
                        'camera vision',
                        'ket noi camera',
                        'cai dat camera',
                        'luong video',
                        'video stream',
                        'camera offline',
                        'camera online',
                        'camera truc tuyen',
                        'camera ngoai tuyen',
                        'goc quay',
                        'hinh anh camera',
                ],
                'fall-detection': [
                        'te nga',
                        'fall detection',
                        'fall-detection',
                        'phat hien te nga',
                        'canh bao te nga',
                        'xu ly te nga',
                        'lich su te nga',
                        'su kien te nga',
                        'muc canh bao',
                        'cap canh bao',
                        'level 1',
                        'level 2',
                        'level 3',
                        'cap 1',
                        'cap 2',
                        'cap 3',
                        'movenet',
                        'gui sos',
                        'canh bao khan cap',
                        'phat hien nguoi nga',
                        'phat hien bat thuong',
                ],
                account: [
                        'tai khoan',
                        'ho so ca nhan',
                        'thong tin ca nhan',
                        'thanh vien gia dinh',
                        'gia dinh',
                        'phan quyen',
                        'mat khau',
                        'doi mat khau',
                        'email tai khoan',
                        'so dien thoai tai khoan',
                        'bao mat tai khoan',
                        'thiet bi dang nhap',
                        'phien dang nhap',
                        'dang nhap',
                        'dang xuat',
                        'xac thuc tai khoan',
                ],
                troubleshooting: [
                        'loi',
                        'khong hoat dong',
                        'khong chay',
                        'khong ket noi duoc',
                        'bi hong',
                        'khong phan hoi',
                        'khong hien thi',
                        'khong nhan dien',
                        'khong xac minh duoc',
                        'khong gui duoc',
                        'khong nhan duoc',
                        'khong dang nhap duoc',
                        'khong the dang nhap',
                        'bao loi',
                        'khac phuc',
                        'sua loi',
                        'debug',
                        'exception',
                        'error',
                        'bug',
                        'timeout',
                        'crash',
                        'failed',
                        'failure',
                        'not working',
                        'does not work',
                        'cannot connect',
                        'unable to connect',
                ],
                architecture: [
                        'kien truc he thong',
                        'kien truc tong the',
                        'kien truc phan mem',
                        'so do kien truc',
                        'mo hinh kien truc',
                        'cau truc he thong',
                        'luong du lieu giua cac service',
                        'system architecture',
                        'software architecture',
                        'application architecture',
                        'architecture diagram',
                        'microservices',
                        'microservice',
                        'api gateway',
                        'data flow diagram',
                        'sequence diagram',
                        'component diagram',
                        'deployment diagram',
                        'mermaid',
                        'flowchart',
                        'diagram',
                        'so do',
                        'luu do',
                ],
        };

        private readonly domainPriority: Array<Exclude<SafioIntent, 'general'>> = [
                'face-id',
                'fall-detection',
                'camera',
                'account',
                'troubleshooting',
                'architecture',
        ];

        private readonly explicitQuestionPatterns = [
                /^(ai|cai gi|la gi|the nao|nhu the nao|tai sao|vi sao)\b/,
                /^(what|why|how|when|where|who|which)\b/,
                /\b(la gi|nghia la gi|what is|what are|who is|meaning of)\b/,
        ];

        public isGenericFollowUp(question: string): boolean {
                const q = this.normalize(question);

                if (!q || q.length > this.maxFollowUpLength) {
                        return false;
                }

                if (this.includesAny(q, this.topicSwitchSignals)) {
                        return false;
                }

                if (this.genericFollowUps.includes(q)) {
                        return true;
                }

                if (this.explicitQuestionPatterns.some((pattern) => pattern.test(q))) {
                        return false;
                }

                if (
                        this.includesAny(q, [
                                'camera nao',
                                'san pham nao',
                                'thuong hieu nao',
                                'gia bao nhieu',
                                'bao nhieu tien',
                                'la gi',
                                'what is',
                                'which camera',
                                'which product',
                        ])
                ) {
                        return false;
                }

                const words = q.split(' ').filter(Boolean);

                if (
                        words.length <= 3 &&
                        this.includesAny(q, [
                                'no',
                                'cai do',
                                'cai nay',
                                'the con',
                                'con sao',
                                'roi sao',
                                'tai sao',
                                'vi sao',
                                'nhu the nao',
                                'tiep tuc',
                                'tiep di',
                                'them di',
                                'noi them',
                                'giai thich',
                                'chi tiet hon',
                                'cu the hon',
                                'lam ro',
                        ])
                ) {
                        return true;
                }

                return (
                        q.length <= 45 &&
                        this.includesAny(q, this.continuationSignals) &&
                        !this.includesAny(q, ['chu de khac', 'cau hoi khac', 'khong lien quan'])
                );
        }

        private inferIntentFromText(content: string): SafioIntent | null {
                const normalized = this.normalize(content);

                if (!normalized) {
                        return null;
                }

                for (const intent of this.domainPriority) {
                        const signals = this.domainSignals[intent];

                        if (this.includesAny(normalized, signals)) {
                                return intent;
                        }
                }

                return null;
        }

        public inferIntentFromHistory(history: SIAChatMessage[]): SafioIntent | null {
                if (!history?.length) {
                        return null;
                }

                const recentMessages = history
                        .slice(-this.historyLimit)
                        .filter((message) => message.content?.trim());

                if (!recentMessages.length) {
                        return null;
                }

                // Tìm chủ đề được người dùng nêu rõ gần nhất.
                for (let i = recentMessages.length - 1; i >= 0; i--) {
                        const message = recentMessages[i];

                        if (message.role !== 'user') {
                                continue;
                        }

                        const intent = this.inferIntentFromText(message.content);

                        if (intent) {
                                return intent;
                        }
                }

                // Nếu người dùng không nêu rõ domain, suy luận từ phản hồi SIA gần nhất.
                for (let i = recentMessages.length - 1; i >= 0; i--) {
                        const message = recentMessages[i];

                        if (message.role !== 'assistant') {
                                continue;
                        }

                        const intent = this.inferIntentFromText(message.content);

                        if (intent) {
                                return intent;
                        }
                }

                return null;
        }
}
