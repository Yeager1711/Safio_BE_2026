import { Injectable, Logger } from '@nestjs/common';
import { SIAChatMessage } from '../context/conversation-summary.service';
import { SafioIntent } from './intent-router.types';
import { KeywordIntentRouter } from './keyword-intent.router';
import { DiagramIntentRouter } from './diagram-intent.router';
import { FollowUpIntentRouter } from './follow-up-intent.router';
import { ExternalKnowledgeRouter } from './external-knowledge.router';
import { LlmIntentRouter } from './llm-intent.router';

@Injectable()
export class IntentRouterService {
        private readonly logger = new Logger(IntentRouterService.name);

        constructor(
                private readonly keywordRouter: KeywordIntentRouter,
                private readonly diagramRouter: DiagramIntentRouter,
                private readonly followUpRouter: FollowUpIntentRouter,
                private readonly externalKnowledgeRouter: ExternalKnowledgeRouter,
                private readonly llmRouter: LlmIntentRouter
        ) {}

        public needsExternalKnowledge(question: string, intent: SafioIntent): boolean {
                return this.externalKnowledgeRouter.needsExternalKnowledge(question, intent);
        }

        public async detect(
                question: string,
                history: SIAChatMessage[] = []
        ): Promise<SafioIntent> {
                const normalizedQuestion = question?.trim();

                if (!normalizedQuestion) {
                        return 'general';
                }

                // 1. Xử lý xác nhận vẽ sơ đồ theo domain của hội thoại trước.
                if (this.diagramRouter.isDiagramConfirmation(normalizedQuestion, history)) {
                        const inferred = this.followUpRouter.inferIntentFromHistory(history);

                        if (inferred) {
                                this.logger.log(
                                        `Diagram confirmation → previous domain: ${inferred}`
                                );

                                return inferred;
                        }

                        this.logger.log('Diagram confirmation → architecture fallback');

                        return 'architecture';
                }

                // 2. Ưu tiên intent rõ ràng trong câu hỏi hiện tại.
                // Tránh để lịch sử cũ ghi đè chủ đề mới.
                const keywordIntent = this.keywordRouter.detectByKeyword(normalizedQuestion);

                if (keywordIntent !== 'general') {
                        this.logger.log(`Keyword intent → ${keywordIntent}`);
                        return keywordIntent;
                }

                // 3. Kế thừa intent nếu đây thực sự là câu hỏi tiếp nối.
                if (this.followUpRouter.isGenericFollowUp(normalizedQuestion)) {
                        const inferred = this.followUpRouter.inferIntentFromHistory(history);

                        if (inferred) {
                                this.logger.log(`Follow-up intent → ${inferred}`);

                                return inferred;
                        }
                }

                // 4. Dùng LLM khi keyword và context chưa đủ căn cứ.
                try {
                        const intent = await this.llmRouter.detectByLLM(
                                normalizedQuestion,
                                history
                        );

                        this.logger.log(`LLM intent → ${intent}`);

                        return intent;
                } catch (error) {
                        this.logger.error(
                                'LLM intent detection failed; using general fallback.',
                                error instanceof Error ? error.stack : undefined
                        );

                        return 'general';
                }
        }
}

export { SafioIntent } from './intent-router.types';
