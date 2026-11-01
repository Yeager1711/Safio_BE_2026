# SIA Intent Router Refactor

## Files
- `intent-router.service.ts`: main facade and orchestration.
- `keyword-intent.router.ts`: keyword-based intent rules.
- `diagram-intent.router.ts`: diagram-domain detection and diagram confirmation.
- `follow-up-intent.router.ts`: short follow-ups and inference from conversation history.
- `external-knowledge.router.ts`: decides whether external web knowledge is needed.
- `llm-intent.router.ts`: Groq classification with OpenRouter fallback.
- `intent-router.types.ts`: shared intent type.
- `intent-router.utils.ts`: shared text normalization.

## Integration
Place these `.ts` files alongside your existing `intent-router.service.ts` so the original relative import to `../context/conversation-summary.service` remains valid.

Register all router classes in the module `providers` array:
```ts
providers: [
  IntentRouterService,
  KeywordIntentRouter,
  DiagramIntentRouter,
  FollowUpIntentRouter,
  ExternalKnowledgeRouter,
  LlmIntentRouter,
]
```
Keep `ConfigModule` imported in the module as needed for `ConfigService`.

## Notes
This is a structural refactor based on the supplied source. It preserves the current keyword lists, routing priority, and Groq → OpenRouter fallback order. Run the TypeScript build and existing tests before replacing the current implementation. The shared utility is used by each router to keep normalization consistent.
