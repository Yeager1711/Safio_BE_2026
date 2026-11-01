import { Injectable } from '@nestjs/common';
import { SIAChatMessage } from '../context/conversation-summary.service';
import { normalizeIntentText } from './intent-router.utils';
import { SafioIntent } from './intent-router.types';

@Injectable()
export class DiagramIntentRouter {
        private normalize(value: string): string {
                return normalizeIntentText(value ?? '')
                        .replace(/\s+/g, ' ')
                        .trim();
        }

        private includesAny(value: string, signals: string[]): boolean {
                const normalized = this.normalize(value);
                return signals.some((signal) => normalized.includes(this.normalize(signal)));
        }

        private matchesAny(value: string, patterns: RegExp[]): boolean {
                const normalized = this.normalize(value);
                return patterns.some((pattern) => pattern.test(normalized));
        }

        private readonly diagramObjects = [
                'so do',
                'luu do',
                'flowchart',
                'diagram',
                'sequence diagram',
                'class diagram',
                'component diagram',
                'deployment diagram',
                'architecture diagram',
                'activity diagram',
                'use case diagram',
                'erd',
                'entity relationship diagram',
                'data flow diagram',
                'dfd',
                'state diagram',
                'mind map',
                'mindmap',
                'so do tu duy',
                'so do khoi',
                'so do quy trinh',
                'so do luong du lieu',
                'so do ket noi',
                'so do hoat dong',
                'so do tuan tu',
                'luong xu ly',
                'luong hoat dong',
                'mo hinh kien truc',
                'kien truc he thong',
        ];

        private readonly diagramActionSignals = [
                've',
                've giup',
                've cho toi',
                'tao',
                'tao giup',
                'tao cho toi',
                'dung',
                'dung giup',
                'minh hoa',
                'truc quan hoa',
                'hien thi',
                'cho xem',
                'cho toi xem',
                'trinh bay',
                'mo phong',
                'bieu dien',
                'chuyen thanh so do',
                'chuyen thanh luu do',
                'chuyen thanh flowchart',
                'illustrate',
                'visualize',
                'draw',
                'generate a diagram',
                'create a diagram',
                'show me a diagram',
                'make a flowchart',
                'plot a diagram',
        ];

        private readonly explanatorySignals = [
                'la gi',
                'nghia la gi',
                'la nhu the nao',
                'giai thich',
                'khac nhau nhu the nao',
                'tai sao',
                'vi sao',
                'what is',
                'what does',
                'explain',
                'meaning of',
                'difference between',
        ];

        private readonly faceIdSignals = [
                'face id',
                'faceid',
                'khuon mat',
                'nhan dien khuon mat',
                'xac minh khuon mat',
                'dang ky khuon mat',
                'sinh trac',
                'face recognition',
                'facial recognition',
                'face verification',
                'face authentication',
                'biometric authentication',
                'embedding khuon mat',
        ];

        private readonly cameraSignals = [
                'camera',
                'camera ip',
                'ip camera',
                'ezviz',
                'imou',
                'rtsp',
                'onvif',
                'luong video',
                'video stream',
                'camera stream',
                'ket noi camera',
                'ket noi thiet bi',
                'giam sat video',
                'camera vision',
        ];

        private readonly fallSignals = [
                'te nga',
                'fall detection',
                'fall-detection',
                'phat hien te nga',
                'canh bao te nga',
                'xu ly te nga',
                'quy trinh te nga',
                'quy trinh canh bao',
                'muc canh bao',
                'cap canh bao',
                'level 1',
                'level 2',
                'level 3',
                'cap 1',
                'cap 2',
                'cap 3',
                'movenet',
                'phat hien nguoi nga',
                'phat hien bat thuong',
                'gui sos',
                'canh bao khan cap',
        ];

        private readonly architectureSignals = [
                'safio',
                'sia',
                'kien truc he thong',
                'kien truc tong the',
                'kien truc phan mem',
                'kien truc backend',
                'kien truc frontend',
                'backend',
                'frontend',
                'api gateway',
                'microservices',
                'microservice',
                'he thong tong the',
                'cau truc he thong',
                'cau truc phan mem',
                'thiet ke he thong',
                'database',
                'co so du lieu',
                'luong du lieu giua cac service',
                'service architecture',
                'software architecture',
                'system architecture',
                'application architecture',
                'high level architecture',
                'technical architecture',
        ];

        private readonly architecturePatterns = [
                /\bso do\s+(kien truc|he thong|tong the|cau truc|phan mem)\b/,
                /\bso do\s+(sia|safio)\b/,
                /\bmo hinh\s+(sia|safio|he thong|tong the|phan mem)\b/,
                /\bkien truc\s+(sia|safio|he thong|tong the|backend|frontend)\b/,
                /\barchitecture\s+(diagram|of|for|sia|safio|system|software)\b/,
                /\b(system|software|application|technical)\s+architecture\b/,
                /\bflowchart\s+(sia|safio|system|backend)\b/,
                /\bdiagram\s+(sia|safio|system|backend)\b/,
        ];

        private readonly processSignals = [
                'quy trinh',
                'cac buoc',
                'luong xu ly',
                'luong hoat dong',
                'cach hoat dong',
                'cach van hanh',
                'tu dau den cuoi',
                'tu khi bat dau',
                'trinh tu xu ly',
                'workflow',
                'work flow',
                'process flow',
                'sequence',
                'how it works',
                'step by step',
                'end to end',
        ];

        private readonly shorthandDiagramPatterns = [
                /^(so do|luu do|flowchart|diagram)\s+(face ?id|camera|te nga|fall detection)\b/,
                /^(face ?id|camera|te nga|fall detection)\s+(so do|luu do|flowchart|diagram)\b/,
                /^(so do|luu do|flowchart|diagram)\s+(sia|safio|he thong)\b/,
                /^(kien truc|architecture)\s+(sia|safio|he thong|backend|frontend)\b/,
        ];

        private readonly confirmationPatterns = [
                /^(co|co chu|co nhe|duoc|duoc chu|duoc nha|duoc day|ok|oke|okay|okey|yes|yep|yeah|sure|please do)$/,
                /^(u|uh|uhm|um|uk|uh uh|oke nha)$/,
                /^(ve|ve di|ve nhe|ve giup toi|ve cho toi|ve cho minh)$/,
                /^(tao|tao di|tao nhe|tao giup toi|tao cho toi)$/,
                /^(lam|lam di|lam nhe|lam giup toi|trien khai di)$/,
                /^(cho xem|cho xem di|cho toi xem|hien thi di|minh hoa di)$/,
                /^(dung|dung di|thuc hien di|tiep tuc di|bat dau di)$/,
                /^(yes please|go ahead|draw it|show me|make it|do it)$/,
        ];

        private readonly invitationSignals = [
                'ban co muon minh ve',
                'ban co muon xem',
                'ban co muon minh tao',
                'ban muon minh ve',
                'ban muon xem so do',
                'toi co the ve',
                'minh co the ve',
                'minh co the minh hoa',
                'co muon xem so do',
                'co muon minh ve',
                'co muon tao so do',
                'hay de minh ve',
                'muon minh trinh bay bang so do',
                'muon minh minh hoa',
                'neu ban muon minh co the ve',
                'toi co the minh hoa bang so do',
                'would you like me to draw',
                'would you like a diagram',
                'shall i draw',
                'i can draw',
                'i can create a diagram',
                'want me to visualize',
        ];

        private readonly nonInvitationSignals = [
                'khong can ve',
                'khong ve so do',
                'khong tao so do',
                'khong can minh hoa',
                'khong can luu do',
                'khong can tao diagram',
                'khong can ve flowchart',
                'do not draw',
                "don't draw",
                'no diagram needed',
        ];

        private isExplicitDiagramRequest(question: string): boolean {
                const q = this.normalize(question);

                if (
                        this.includesAny(q, this.explanatorySignals) &&
                        !this.includesAny(q, this.diagramActionSignals)
                ) {
                        return false;
                }

                const hasObject = this.includesAny(q, this.diagramObjects);
                const hasAction = this.includesAny(q, this.diagramActionSignals);
                const hasProcess = this.includesAny(q, this.processSignals);
                const hasDomain = this.includesAny(q, [
                        ...this.faceIdSignals,
                        ...this.cameraSignals,
                        ...this.fallSignals,
                        ...this.architectureSignals,
                ]);

                if (hasObject && hasAction) {
                        return true;
                }

                if (hasAction && hasProcess) {
                        return true;
                }

                if (
                        hasDomain &&
                        this.matchesAny(q, [
                                /\b(minh hoa|truc quan hoa|visualize|illustrate)\b/,
                                /\b(ve|tao|hien thi|cho xem|trinh bay|mo phong)\b.*\b(quy trinh|he thong|cach hoat dong|luong xu ly|workflow|process)\b/,
                                /\b(show me|draw|create|generate)\b.*\b(workflow|process|system|flow)\b/,
                        ])
                ) {
                        return true;
                }

                return this.matchesAny(q, this.shorthandDiagramPatterns);
        }

        public isDiagramConfirmation(question: string, history: SIAChatMessage[]): boolean {
                const q = this.normalize(question);

                if (!q || !history?.length) {
                        return false;
                }

                if (q.length > 80 || this.includesAny(q, this.nonInvitationSignals)) {
                        return false;
                }

                if (!this.matchesAny(q, this.confirmationPatterns)) {
                        return false;
                }

                const lastAssistant = [...history]
                        .reverse()
                        .find((message) => message.role === 'assistant');

                if (!lastAssistant?.content) {
                        return false;
                }

                const previous = this.normalize(lastAssistant.content);

                if (this.includesAny(previous, this.nonInvitationSignals)) {
                        return false;
                }

                const hasInvitation = this.includesAny(previous, this.invitationSignals);

                const hasDiagramContext =
                        this.includesAny(previous, this.diagramObjects) ||
                        this.includesAny(previous, this.diagramActionSignals) ||
                        this.includesAny(previous, this.processSignals);

                return hasInvitation && hasDiagramContext;
        }

        public detectDiagramDomain(question: string): SafioIntent | null {
                const q = this.normalize(question);

                if (!q || !this.isExplicitDiagramRequest(q)) {
                        return null;
                }

                if (this.includesAny(q, this.faceIdSignals)) {
                        return 'face-id';
                }

                if (this.includesAny(q, this.fallSignals)) {
                        return 'fall-detection';
                }

                if (this.includesAny(q, this.cameraSignals)) {
                        return 'camera';
                }

                if (
                        this.matchesAny(q, this.architecturePatterns) ||
                        this.includesAny(q, this.architectureSignals)
                ) {
                        return 'architecture';
                }

                return null;
        }
}
