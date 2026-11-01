import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { isIP } from 'node:net';

interface TavilySearchResult {
        title?: string;
        content?: string;
        url?: string;
        score?: number;
}

interface TavilyImageResult {
        url?: string;
        description?: string;
}

interface FormattedImage {
        url: string;
        description: string;
}

@Injectable()
export class WebSearchService {
        private readonly logger = new Logger(WebSearchService.name);
        private readonly apiKey: string;
        private readonly apiUrl = 'https://api.tavily.com/search';

        constructor(private readonly configService: ConfigService) {
                this.apiKey = this.configService.get<string>('TAVILY_API_KEY') || '';
        }

        async search(query: string, maxResults = 5): Promise<string> {
                if (!this.apiKey) {
                        this.logger.warn('TAVILY_API_KEY is missing');
                        return '';
                }

                try {
                        const response = await axios.post(
                                this.apiUrl,
                                {
                                        api_key: this.apiKey,
                                        query,
                                        search_depth: 'advanced',
                                        max_results: maxResults,
                                        include_answer: true,
                                        include_images: true,
                                        include_image_descriptions: true,
                                        include_raw_content: true,
                                },
                                { timeout: 20000 }
                        );

                        const results: TavilySearchResult[] = Array.isArray(response.data?.results)
                                ? response.data.results
                                : [];

                        const images: FormattedImage[] = (
                                Array.isArray(response.data?.images) ? response.data.images : []
                        )
                                .map((image: TavilyImageResult) => ({
                                        url: this.getSafeUrl(image.url) || '',
                                        description: image.description?.trim() || '',
                                }))
                                .filter((image: FormattedImage) => image.url);

                        if (!results.length) {
                                this.logger.warn('Tavily returned no search results');
                                return '';
                        }

                        const formattedResults = await Promise.all(
                                results.map(async (result, index) => {
                                        const title = result.title?.trim() || 'Không có tiêu đề';
                                        const content = result.content?.trim() || '';
                                        const url = this.getSafeUrl(result.url);

                                        if (!url) return '';

                                        let imageUrl = await this.getPageImage(url);

                                        if (!imageUrl) {
                                                imageUrl =
                                                        this.findMatchingImage(
                                                                title,
                                                                content,
                                                                images
                                                        ) || '';
                                        }

                                        this.logger.log(
                                                `Search result ${index + 1}: image ${imageUrl ? 'found' : 'not found'}`
                                        );

                                        return [
                                                `[${index + 1}] ${title}`,
                                                content,
                                                `Nguồn: ${url}`,
                                                imageUrl
                                                        ? `Ảnh đại diện: ${imageUrl}`
                                                        : 'Ảnh đại diện: Không tìm thấy',
                                        ].join('\n');
                                })
                        );

                        const answer =
                                typeof response.data?.answer === 'string'
                                        ? response.data.answer.trim()
                                        : '';

                        const output = [
                                answer ? `TÓM TẮT TÌM KIẾM:\n${answer}` : '',
                                'KẾT QUẢ TÌM KIẾM:',
                                formattedResults.filter(Boolean).join('\n\n'),
                        ]
                                .filter(Boolean)
                                .join('\n\n');

                        this.logger.log(
                                `Search completed: ${results.length} results, ${images.length} Tavily images`
                        );

                        return output;
                } catch (error: unknown) {
                        const message = axios.isAxiosError(error)
                                ? error.response?.data?.message || error.message
                                : error instanceof Error
                                  ? error.message
                                  : 'Unknown error';

                        this.logger.warn(`Web search failed: ${message}`);
                        return '';
                }
        }

        private async getPageImage(pageUrl: string): Promise<string | null> {
                const safePageUrl = this.getSafeUrl(pageUrl);

                if (!safePageUrl || !this.isAllowedHost(safePageUrl)) {
                        return null;
                }

                try {
                        const response = await axios.get(safePageUrl, {
                                timeout: 5000,
                                maxRedirects: 0,
                                maxContentLength: 1024 * 1024,
                                responseType: 'text',
                                headers: {
                                        'User-Agent': 'Mozilla/5.0 (compatible; SIA-WebSearch/1.0)',
                                        Accept: 'text/html,application/xhtml+xml',
                                },
                                validateStatus: (status) => status >= 200 && status < 300,
                        });

                        const contentType = String(response.headers['content-type'] || '');

                        if (
                                !contentType.includes('text/html') &&
                                !contentType.includes('application/xhtml+xml')
                        ) {
                                return null;
                        }

                        const html = String(response.data || '');

                        const patterns = [
                                /<meta\b[^>]*\bproperty\s*=\s*["']og:image(?::secure_url)?["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i,
                                /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bproperty\s*=\s*["']og:image(?::secure_url)?["'][^>]*>/i,
                                /<meta\b[^>]*\bname\s*=\s*["']twitter:image(?::src)?["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i,
                                /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']twitter:image(?::src)?["'][^>]*>/i,
                        ];

                        for (const pattern of patterns) {
                                const match = html.match(pattern);

                                if (match?.[1]) {
                                        const imageUrl = this.getSafeUrl(
                                                this.decodeHtmlEntities(match[1]),
                                                safePageUrl
                                        );

                                        if (imageUrl && this.isAllowedHost(imageUrl)) {
                                                return imageUrl;
                                        }
                                }
                        }

                        return null;
                } catch {
                        return null;
                }
        }

        private findMatchingImage(
                title: string,
                content: string,
                images: FormattedImage[]
        ): string | null {
                const normalize = (value: string) =>
                        value
                                .toLowerCase()
                                .normalize('NFD')
                                .replace(/[\u0300-\u036f]/g, '')
                                .replace(/[^a-z0-9\s]/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();

                const titleWords = normalize(title)
                        .split(' ')
                        .filter((word) => word.length >= 4);

                if (!titleWords.length) return null;

                const context = normalize(`${title} ${content}`);

                const matches = images
                        .map((image) => {
                                const description = normalize(image.description);

                                if (!description) {
                                        return { image, score: 0 };
                                }

                                const score = titleWords.filter((word) =>
                                        description.includes(word)
                                ).length;

                                const titleMatch = titleWords.some((word) =>
                                        description.includes(word)
                                );

                                return {
                                        image,
                                        score:
                                                titleMatch && context.includes(description)
                                                        ? score + 1
                                                        : score,
                                };
                        })
                        .filter((item) => item.score >= 2)
                        .sort((a, b) => b.score - a.score);

                return matches[0]?.image.url || null;
        }

        private getSafeUrl(value?: string | null, baseUrl?: string): string | null {
                if (!value || typeof value !== 'string') return null;

                try {
                        const url = baseUrl
                                ? new URL(value.trim(), baseUrl)
                                : new URL(value.trim());

                        if (!['https:', 'http:'].includes(url.protocol)) return null;
                        if (url.username || url.password) return null;

                        return url.href;
                } catch {
                        return null;
                }
        }

        private isAllowedHost(value: string): boolean {
                try {
                        const hostname = new URL(value).hostname
                                .toLowerCase()
                                .replace(/^\[|\]$/g, '');

                        if (
                                hostname === 'localhost' ||
                                hostname.endsWith('.localhost') ||
                                hostname.endsWith('.local') ||
                                hostname === '::1' ||
                                hostname.startsWith('fc') ||
                                hostname.startsWith('fd') ||
                                hostname.startsWith('fe80:')
                        ) {
                                return false;
                        }

                        if (isIP(hostname) === 4) {
                                const parts = hostname.split('.').map(Number);
                                const [a, b] = parts;

                                if (
                                        a === 0 ||
                                        a === 10 ||
                                        a === 127 ||
                                        (a === 169 && b === 254) ||
                                        (a === 172 && b >= 16 && b <= 31) ||
                                        (a === 192 && b === 168) ||
                                        (a === 100 && b >= 64 && b <= 127) ||
                                        a >= 224
                                ) {
                                        return false;
                                }
                        }

                        if (isIP(hostname) === 6) {
                                const normalized = hostname.toLowerCase();

                                if (
                                        normalized === '::' ||
                                        normalized === '::1' ||
                                        normalized.startsWith('fc') ||
                                        normalized.startsWith('fd') ||
                                        normalized.startsWith('fe80:')
                                ) {
                                        return false;
                                }
                        }

                        return true;
                } catch {
                        return false;
                }
        }

        private decodeHtmlEntities(value: string): string {
                return value
                        .replace(/&amp;/gi, '&')
                        .replace(/&quot;/gi, '"')
                        .replace(/&#39;|&apos;/gi, "'")
                        .replace(/&lt;/gi, '<')
                        .replace(/&gt;/gi, '>');
        }
}
