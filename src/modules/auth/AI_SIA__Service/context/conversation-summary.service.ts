export type SIAChatMessage = {
        role: 'user' | 'assistant';
        content: string;
};

export type PreparedConversation = {
        summary: string;
        recentMessages: SIAChatMessage[];
};

export class ConversationSummaryService {
        private readonly recentLimit = 12;
        private readonly maxMessageChars = 1000;
        private readonly maxSummaryChars = 1800;

        prepare(history: SIAChatMessage[] = []): PreparedConversation {
                const validHistory = history
                        .filter(
                                (message) =>
                                        (message.role === 'user' || message.role === 'assistant') &&
                                        typeof message.content === 'string' &&
                                        message.content.trim().length > 0
                        )
                        .map((message) => ({
                                role: message.role,
                                content: message.content.trim().slice(0, this.maxMessageChars),
                        }));

                const splitIndex = Math.max(0, validHistory.length - this.recentLimit);

                const olderMessages = validHistory.slice(0, splitIndex);
                const recentMessages = validHistory.slice(splitIndex);

                return {
                        summary: this.buildSummary(olderMessages),
                        recentMessages,
                };
        }

        private buildSummary(messages: SIAChatMessage[]): string {
                if (!messages.length) return '';

                const selected = messages.slice(-8);

                const summary = selected
                        .map((message) => {
                                const speaker = message.role === 'user' ? 'Người dùng' : 'SIA';

                                return `${speaker}: ${message.content}`;
                        })
                        .join('\n');

                return summary.slice(0, this.maxSummaryChars);
        }
}
