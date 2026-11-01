import { Injectable } from '@nestjs/common';
import { DiagramIntentRouter } from './diagram-intent.router';
import { SafioIntent } from './intent-router.types';
import { normalizeIntentText } from './intent-router.utils';

type IntentRule = {
        intent: SafioIntent;
        keywords: string[];
        patterns?: RegExp[];
};

@Injectable()
export class KeywordIntentRouter {
        constructor(private readonly diagramRouter: DiagramIntentRouter) {}

        private normalize(value: string): string {
                return normalizeIntentText(value ?? '')
                        .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
        }

        private includesAny(value: string, keywords: string[]): boolean {
                const normalized = ` ${this.normalize(value)} `;

                return keywords.some((keyword) => {
                        const target = this.normalize(keyword);
                        return target.length > 0 && normalized.includes(` ${target} `);
                });
        }

        private matchesAny(value: string, patterns: RegExp[]): boolean {
                const normalized = this.normalize(value);
                return patterns.some((pattern) => pattern.test(normalized));
        }

        private readonly architecturePatterns: RegExp[] = [
                /\b(kien truc|mo hinh kien truc)\s+(sia|safio|he thong|tong the|phan mem)\b/,
                /\bso do\s+(kien truc|he thong|tong the|cau truc|phan mem)\b/,
                /\bso do\s+(sia|safio)\b/,
                /\bmo hinh\s+(sia|safio|he thong|tong the)\b/,
                /\b(system|software|application|technical)\s+architecture\b/,
                /\barchitecture\s+(diagram|sia|safio|system|software)\b/,
                /\b(flowchart|diagram)\s+(sia|safio|system)\b/,
                /\bthiet ke he thong\s+(sia|safio)\b/,
        ];

        private readonly architectureKeywords = [
                'kien truc sia',
                'kien truc safio',
                'kien truc he thong safio',
                'kien truc he thong sia',
                'kien truc tong the',
                'kien truc phan mem',
                'mo hinh sia',
                'mo hinh safio',
                'mo hinh he thong safio',
                'mo hinh tong the',
                'so do sia',
                'so do safio',
                'so do tong the sia',
                'so do tong the safio',
                'system architecture',
                'software architecture',
                'architecture diagram',
                'safio architecture',
                'sia architecture',
                'microservices architecture',
                'kien truc microservices',
                'kien truc backend',
                'kien truc frontend',
                'cau truc he thong',
                'cau truc phan mem',
                'luong du lieu giua cac service',
                'api gateway',
                'database architecture',
                'thiet ke tong the he thong',
        ];

        private readonly troubleshootingSignals = [
                'khac phuc',
                'sua loi',
                'bi loi',
                'bao loi',
                'gap loi',
                'loi he thong',
                'loi ket noi',
                'loi xac thuc',
                'loi dang nhap',
                'khong hoat dong',
                'khong chay',
                'khong hien thi',
                'khong phan hoi',
                'khong ket noi duoc',
                'khong dang nhap duoc',
                'khong xac minh duoc',
                'khong nhan dien duoc',
                'khong gui duoc',
                'khong nhan duoc',
                'bi treo',
                'bi dung',
                'bi mat ket noi',
                'khong hoat dong dung cach',
                'debug',
                'exception',
                'stack trace',
                'timeout',
                'crash',
                'failed',
                'failure',
                'not working',
                'does not work',
                'cannot connect',
                'unable to connect',
                'connection error',
                'authentication error',
                'login error',
                'something went wrong',
                'how to fix',
                'fix this',
                'troubleshoot',
        ];

        private readonly rules: IntentRule[] = [
                {
                        intent: 'fall-detection',
                        keywords: [
                                'te nga',
                                'fall detection',
                                'fall-detection',
                                'phat hien te nga',
                                'phat hien nguoi nga',
                                'canh bao te nga',
                                'xu ly te nga',
                                'quy trinh te nga',
                                'lich su te nga',
                                'su kien te nga',
                                'thong ke te nga',
                                'so lan te nga',
                                'muc canh bao',
                                'cap canh bao',
                                'cap 1',
                                'cap 2',
                                'cap 3',
                                'muc 1',
                                'muc 2',
                                'muc 3',
                                'level 1',
                                'level 2',
                                'level 3',
                                'snapshot te nga',
                                'hinh anh ghi nhan',
                                'du lieu ghi nhan',
                                'su kien nghiem trong',
                                'su kien cap 3',
                                'lich su cap 3',
                                'lich su muc 3',
                                'su kien muc 3',
                                'movenet',
                                'canh bao sos',
                                'gui sos',
                                'canh bao khan cap',
                                'phat hien bat thuong',
                                'nguoi nam bat dong',
                                'fall event',
                                'fall events',
                                'fall statistics',
                                'fall history',
                                'fall alert',
                                'fall level',
                        ],
                        patterns: [
                                /\b(te nga|fall detection)\b/,
                                /\b(lich su|thong ke|so lan)\s+(su kien|ghi nhan|canh bao)\b/,
                                /\b(cap|muc|level)\s*[123]\b/,
                        ],
                },
                {
                        intent: 'face-id',
                        keywords: [
                                'face id',
                                'faceid',
                                'face-id',
                                'khuon mat',
                                'nhan dien khuon mat',
                                'xac minh khuon mat',
                                'dang ky khuon mat',
                                'quet khuon mat',
                                'sinh trac',
                                'xac thuc sinh trac',
                                'face recognition',
                                'facial recognition',
                                'face verification',
                                'face authentication',
                                'face scan',
                                'face scanning',
                                'face profile',
                                'face embedding',
                                'embedding khuon mat',
                                'mo khoa bang khuon mat',
                                'bao mat bang khuon mat',
                                'nhan dien khuon mat ai',
                                'camera nhan dien khuon mat',
                        ],
                },
                {
                        intent: 'account',
                        keywords: [
                                'tai khoan',
                                'ho so ca nhan',
                                'ho so nguoi dung',
                                'thong tin ca nhan',
                                'thanh vien gia dinh',
                                'thanh vien',
                                'gia dinh',
                                'phan quyen',
                                'mat khau',
                                'doi mat khau',
                                'quen mat khau',
                                'email tai khoan',
                                'so dien thoai tai khoan',
                                'bao mat tai khoan',
                                'thiet bi dang nhap',
                                'phien dang nhap',
                                'dang nhap',
                                'dang xuat',
                                'xac thuc tai khoan',
                                'thong tin nguoi dung',
                                'vai tro nguoi dung',
                                'quyen truy cap',
                                'tai khoan ca nhan',
                                'user profile',
                                'account settings',
                                'device sessions',
                                'login session',
                                'family members',
                                'user permissions',
                        ],
                },
                {
                        intent: 'troubleshooting',
                        keywords: this.troubleshootingSignals,
                        patterns: [
                                /\b(khong|chua)\s+(the\s+)?(hoat dong|ket noi|dang nhap|xac minh|nhan dien|hien thi|gui|nhan duoc)\b/,
                                /\b(loi|error|exception|timeout|crash|failed)\b/,
                        ],
                },
                {
                        intent: 'camera',
                        keywords: [
                                'camera',
                                'camera ip',
                                'ip camera',
                                'ezviz',
                                'imou',
                                'rtsp',
                                'onvif',
                                'camera vision',
                                'ket noi camera',
                                'cai dat camera',
                                'them camera',
                                'xoa camera',
                                'quan ly camera',
                                'camera truc tuyen',
                                'camera ngoai tuyen',
                                'camera online',
                                'camera offline',
                                'camera stream',
                                'video stream',
                                'luong video',
                                'goc quay camera',
                                'hinh anh camera',
                                'danh sach camera',
                                'thiet bi camera',
                                'ip address',
                                'dia chi ip camera',
                                'camera wifi',
                                'camera an ninh',
                                'camera giam sat',
                                'camera device',
                                'camera connection',
                                'camera settings',
                                'camera status',
                                'camera list',
                                'video surveillance',
                        ],
                },
        ];

        private detectTroubleshooting(question: string): boolean {
                return (
                        this.includesAny(question, this.troubleshootingSignals) ||
                        this.matchesAny(question, [
                                /\b(khong|chua)\s+(the\s+)?(hoat dong|ket noi|dang nhap|xac minh|nhan dien|hien thi|gui|nhan duoc)\b/,
                                /\b(loi|error|exception|timeout|crash|failed)\b/,
                        ])
                );
        }

        private detectArchitecture(question: string): boolean {
                return (
                        this.matchesAny(question, this.architecturePatterns) ||
                        this.includesAny(question, this.architectureKeywords)
                );
        }

        public detectByKeyword(question: string): SafioIntent {
                const q = this.normalize(question);

                if (!q) {
                        return 'general';
                }

                // 1. Nhận diện sơ đồ theo domain chuyên biệt.
                const diagramIntent = this.diagramRouter.detectDiagramDomain(question);

                if (diagramIntent) {
                        return diagramIntent;
                }

                // 2. Nhận diện kiến trúc tổng thể một cách tường minh.
                if (this.detectArchitecture(q)) {
                        return 'architecture';
                }

                // 3. Ưu tiên xử lý lỗi nếu câu hỏi mô tả sự cố cụ thể.
                if (this.detectTroubleshooting(q)) {
                        return 'troubleshooting';
                }

                // 4. Phân loại domain theo các tín hiệu cụ thể.
                for (const rule of this.rules) {
                        const keywordMatch = this.includesAny(q, rule.keywords);
                        const patternMatch = rule.patterns
                                ? this.matchesAny(q, rule.patterns)
                                : false;

                        if (keywordMatch || patternMatch) {
                                return rule.intent;
                        }
                }

                // 5. Không đủ bằng chứng để kết luận domain.
                return 'general';
        }
}
