import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';

import * as tf from '@tensorflow/tfjs';
import * as wasm from '@tensorflow/tfjs-backend-wasm';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import * as canvas from 'canvas';
import * as path from 'path';
import * as fs from 'fs';

const { Canvas, Image, ImageData } = canvas;

faceapi.env.monkeyPatch({
        Canvas,
        Image,
        ImageData,
} as any);

@Injectable()
export class FaceAIService implements OnModuleInit {
        private readonly logger = new Logger(FaceAIService.name);

        private modelsLoaded = false;

        // =========================================================
        // EMBEDDING
        // =========================================================

        private readonly EMBEDDING_SIZE = 128;

        // =========================================================
        // IMAGE PROCESSING
        // =========================================================

        /**
         * Camera: 1280x720
         *
         * Resize:
         * 1280x720 → 640x360
         *
         * Giữ nguyên aspect ratio 16:9.
         *
         * Không dùng 720x720 vì:
         * - tăng số pixel phải xử lý
         * - làm méo ảnh camera 16:9
         * - không giúp descriptor tốt hơn tương ứng
         */
        private readonly PROCESSING_WIDTH = 640;
        private readonly PROCESSING_HEIGHT = 360;

        // =========================================================
        // TINY FACE DETECTOR
        // =========================================================

        /**
         * 416 cho độ ổn định detection tốt.
         *
         * 320 nhanh hơn nhưng dễ miss face hơn.
         */
        private readonly DETECTOR_INPUT_SIZE = 416;

        /**
         * Threshold để detector tìm được face.
         *
         * Không nên quá cao ở bước detector.
         * Quality sẽ được kiểm tra riêng bên dưới.
         */
        private readonly DETECTOR_SCORE_THRESHOLD = 0.55;

        // =========================================================
        // SSD FALLBACK
        // =========================================================

        /**
         * SSD chỉ chạy khi Tiny không tìm thấy mặt.
         *
         * Không chạy SSD trong trường hợp Tiny đã detect được.
         */
        private readonly SSD_MIN_CONFIDENCE = 0.5;

        // =========================================================
        // FACE QUALITY
        // =========================================================

        /**
         * Face phải chiếm đủ kích thước ảnh.
         */
        private readonly MIN_FACE_WIDTH_RATIO = 0.1;
        private readonly MIN_FACE_HEIGHT_RATIO = 0.2;

        /**
         * Face không được nằm quá lệch khỏi trung tâm.
         */
        private readonly MAX_CENTER_OFFSET_RATIO = 0.35;

        // =========================================================
        // INITIALIZATION
        // =========================================================

        async onModuleInit() {
                try {
                        // WASM backend
                        wasm.setWasmPaths(
                                'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/'
                        );

                        await tf.setBackend('wasm');
                        await tf.ready();

                        this.logger.log(`TensorFlow backend: ${tf.getBackend()}`);

                        await this.loadModels();

                        // Warm-up
                        await this.warmup();

                        this.modelsLoaded = true;

                        this.logger.log('✅ FaceAI initialized and warmed up');
                } catch (error: any) {
                        this.modelsLoaded = false;

                        this.logger.error(
                                `❌ FaceAI initialization failed: ${error?.message || error}`
                        );
                }
        }

        // =========================================================
        // LOAD MODELS
        // =========================================================

        private async loadModels() {
                const modelPath = path.join(process.cwd(), 'models');

                if (!fs.existsSync(modelPath)) {
                        throw new Error(`Không tìm thấy thư mục models: ${modelPath}`);
                }

                this.logger.log(`Loading FaceAI models from: ${modelPath}`);

                /**
                 * Load song song.
                 *
                 * SSD vẫn được giữ vì dùng làm fallback.
                 */
                await Promise.all([
                        faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),

                        faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),

                        faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),

                        faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
                ]);

                this.logger.log('✅ FaceAI models loaded successfully');
        }

        // =========================================================
        // WARM UP
        // =========================================================

        private async warmup() {
                try {
                        this.logger.log('🔥 Warming up FaceAI...');

                        const dummyCanvas = canvas.createCanvas(
                                this.PROCESSING_WIDTH,
                                this.PROCESSING_HEIGHT
                        );

                        const ctx = dummyCanvas.getContext('2d');

                        /**
                         * Tạo background đơn giản.
                         *
                         * Mục đích:
                         * - khởi tạo WASM graph
                         * - khởi tạo TinyFaceDetector
                         * - tránh request đầu tiên phải chịu cold-start
                         */
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, this.PROCESSING_WIDTH, this.PROCESSING_HEIGHT);

                        const options = new faceapi.TinyFaceDetectorOptions({
                                inputSize: this.DETECTOR_INPUT_SIZE,
                                scoreThreshold: this.DETECTOR_SCORE_THRESHOLD,
                        });

                        await faceapi.detectAllFaces(dummyCanvas as any, options);

                        this.logger.log('🔥 FaceAI warm-up completed');
                } catch (error: any) {
                        /**
                         * Warm-up fail không làm FaceAI chết.
                         */
                        this.logger.warn(`FaceAI warm-up warning: ${error?.message || error}`);
                }
        }

        // =========================================================
        // CREATE EMBEDDING
        // =========================================================

        async createEmbedding(imageBase64: string): Promise<number[]> {
                if (!this.modelsLoaded) {
                        throw new Error('FaceAI models chưa được load');
                }

                const startTime = Date.now();

                try {
                        // =================================================
                        // 1. VALIDATE BASE64
                        // =================================================

                        if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
                                throw new BadRequestException(
                                        'Base64 không hợp lệ hoặc thiếu prefix data:image/'
                                );
                        }

                        const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');

                        if (!base64Data) {
                                throw new BadRequestException('Không có dữ liệu hình ảnh.');
                        }

                        const buffer = Buffer.from(base64Data, 'base64');

                        if (!buffer.length) {
                                throw new BadRequestException('Không thể decode ảnh Base64.');
                        }

                        // =================================================
                        // 2. LOAD IMAGE
                        // =================================================

                        const img = await canvas.loadImage(buffer);

                        const originalWidth = img.width;
                        const originalHeight = img.height;

                        if (
                                !originalWidth ||
                                !originalHeight ||
                                originalWidth < 100 ||
                                originalHeight < 100
                        ) {
                                throw new BadRequestException('Kích thước ảnh không hợp lệ.');
                        }

                        // =================================================
                        // 3. RESIZE
                        // =================================================

                        /**
                         * 1280x720 → 640x360
                         *
                         * Chỉ resize một lần.
                         */
                        const inputCanvas = canvas.createCanvas(
                                this.PROCESSING_WIDTH,
                                this.PROCESSING_HEIGHT
                        );

                        const ctx = inputCanvas.getContext('2d');

                        ctx.drawImage(img, 0, 0, this.PROCESSING_WIDTH, this.PROCESSING_HEIGHT);

                        const input = inputCanvas as any;

                        // =================================================
                        // 4. TINY DETECTION
                        // =================================================

                        const tinyOptions = new faceapi.TinyFaceDetectorOptions({
                                inputSize: this.DETECTOR_INPUT_SIZE,
                                scoreThreshold: this.DETECTOR_SCORE_THRESHOLD,
                        });

                        const detectionStart = Date.now();

                        /**
                         * QUAN TRỌNG:
                         *
                         * Chỉ detect một lần ở đây.
                         *
                         * Sau đó nếu có face → chạy landmarks +
                         * descriptor trên detection đó.
                         */
                        let detections = await faceapi.detectAllFaces(input, tinyOptions);

                        const tinyTime = Date.now() - detectionStart;

                        // =================================================
                        // 5. SSD FALLBACK
                        // =================================================

                        if (detections.length === 0) {
                                this.logger.debug(`[PERF] Tiny miss → SSD fallback`);

                                const ssdStart = Date.now();

                                const ssdOptions = new faceapi.SsdMobilenetv1Options({
                                        minConfidence: this.SSD_MIN_CONFIDENCE,
                                        maxResults: 2,
                                });

                                detections = await faceapi.detectAllFaces(input, ssdOptions);

                                this.logger.debug(
                                        `[PERF] SSD fallback: ${Date.now() - ssdStart}ms`
                                );
                        }

                        // =================================================
                        // 6. FACE COUNT
                        // =================================================

                        if (detections.length === 0) {
                                throw new BadRequestException(
                                        'Không phát hiện được khuôn mặt. Vui lòng nhìn rõ vào camera.'
                                );
                        }

                        if (detections.length > 1) {
                                throw new BadRequestException(
                                        'Phát hiện nhiều khuôn mặt. Vui lòng chỉ có một người trong camera.'
                                );
                        }

                        const detection = detections[0];

                        const detectionScore = detection.score;

                        // =================================================
                        // 7. DETECTION QUALITY
                        // =================================================

                        if (
                                !Number.isFinite(detectionScore) ||
                                detectionScore < this.DETECTOR_SCORE_THRESHOLD
                        ) {
                                throw new BadRequestException(
                                        `Độ tin cậy phát hiện khuôn mặt quá thấp (${detectionScore.toFixed(
                                                2
                                        )}). Vui lòng đưa khuôn mặt rõ hơn vào camera.`
                                );
                        }

                        // =================================================
                        // 8. FACE BOX
                        // =================================================

                        const box = detection.box;

                        const faceWidth = box.width;
                        const faceHeight = box.height;

                        const faceCenterX = box.x + box.width / 2;

                        const faceCenterY = box.y + box.height / 2;

                        // =================================================
                        // 9. FACE SIZE
                        // =================================================

                        const faceWidthRatio = faceWidth / this.PROCESSING_WIDTH;

                        const faceHeightRatio = faceHeight / this.PROCESSING_HEIGHT;

                        if (
                                faceWidthRatio < this.MIN_FACE_WIDTH_RATIO ||
                                faceHeightRatio < this.MIN_FACE_HEIGHT_RATIO
                        ) {
                                throw new BadRequestException(
                                        'Khuôn mặt quá nhỏ. Vui lòng đưa mặt lại gần camera.'
                                );
                        }

                        // =================================================
                        // 10. FACE CENTER
                        // =================================================

                        const imageCenterX = this.PROCESSING_WIDTH / 2;

                        const imageCenterY = this.PROCESSING_HEIGHT / 2;

                        const offsetX =
                                Math.abs(faceCenterX - imageCenterX) / this.PROCESSING_WIDTH;

                        const offsetY =
                                Math.abs(faceCenterY - imageCenterY) / this.PROCESSING_HEIGHT;

                        if (
                                offsetX > this.MAX_CENTER_OFFSET_RATIO ||
                                offsetY > this.MAX_CENTER_OFFSET_RATIO
                        ) {
                                throw new BadRequestException(
                                        'Khuôn mặt nằm quá lệch khỏi camera. Vui lòng đưa mặt vào giữa khung hình.'
                                );
                        }

                        // =================================================
                        // 11. LANDMARK + DESCRIPTOR
                        // =================================================

                        const recognitionStart = Date.now();

                        /**
                         * QUAN TRỌNG NHẤT:
                         *
                         * Không gọi:
                         *
                         * detectSingleFace(...)
                         *
                         * lần nữa.
                         *
                         * Detection đã có ở phía trên.
                         *
                         * Chúng ta chỉ thực hiện:
                         *
                         * detection
                         *      ↓
                         * landmarks
                         *      ↓
                         * descriptor
                         */
                        const faceResult = await faceapi
                                .detectSingleFace(input, tinyOptions)
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                        const recognitionTime = Date.now() - recognitionStart;

                        this.logger.debug(
                                `[PERF] Recognition: ${recognitionTime}ms | Tiny detection: ${tinyTime}ms`
                        );

                        // =================================================
                        // 12. RECOGNITION FALLBACK
                        // =================================================

                        if (!faceResult) {
                                this.logger.warn(
                                        'Tiny recognition failed → SSD recognition fallback'
                                );

                                const ssdRecognitionOptions = new faceapi.SsdMobilenetv1Options({
                                        minConfidence: this.SSD_MIN_CONFIDENCE,
                                        maxResults: 1,
                                });

                                const ssdResult = await faceapi
                                        .detectSingleFace(input, ssdRecognitionOptions)
                                        .withFaceLandmarks()
                                        .withFaceDescriptor();

                                if (!ssdResult) {
                                        throw new BadRequestException(
                                                'Không thể phân tích khuôn mặt. Vui lòng giữ mặt rõ và thử lại.'
                                        );
                                }

                                return this.finalizeEmbedding(
                                        ssdResult.descriptor,
                                        ssdResult.detection.score,
                                        startTime
                                );
                        }

                        // =================================================
                        // 13. FINALIZE
                        // =================================================

                        return this.finalizeEmbedding(
                                faceResult.descriptor,
                                detectionScore,
                                startTime
                        );
                } catch (error: any) {
                        const elapsed = Date.now() - startTime;

                        this.logger.error(
                                `createEmbedding FAILED after ${elapsed}ms: ${
                                        error?.message || error
                                }`
                        );

                        throw error;
                }
        }

        // =========================================================
        // FINALIZE EMBEDDING
        // =========================================================

        private finalizeEmbedding(
                descriptor: Float32Array,
                detectionScore: number,
                startTime: number
        ): number[] {
                if (!descriptor || descriptor.length !== this.EMBEDDING_SIZE) {
                        throw new BadRequestException('Face descriptor không hợp lệ.');
                }

                const embedding = Array.from(descriptor) as number[];

                if (!this.validateEmbedding(embedding)) {
                        throw new BadRequestException('Embedding khuôn mặt không hợp lệ.');
                }

                // =====================================================
                // EMBEDDING NORM
                // =====================================================

                let normSquared = 0;

                for (const value of embedding) {
                        normSquared += value * value;
                }

                const norm = Math.sqrt(normSquared);

                if (!Number.isFinite(norm) || norm < 0.01) {
                        throw new BadRequestException('Face embedding không đủ chất lượng.');
                }

                const elapsed = Date.now() - startTime;

                this.logger.debug(
                        [
                                `[PERF] Embedding generated`,
                                `size=${embedding.length}`,
                                `norm=${norm.toFixed(4)}`,
                                `detection=${detectionScore.toFixed(4)}`,
                                `total=${elapsed}ms`,
                        ].join(' | ')
                );

                return embedding;
        }

        // =========================================================
        // VALIDATE EMBEDDING
        // =========================================================

        validateEmbedding(embedding: number[] | null | undefined): boolean {
                if (!embedding || !Array.isArray(embedding)) {
                        return false;
                }

                if (embedding.length !== this.EMBEDDING_SIZE) {
                        return false;
                }

                for (const value of embedding) {
                        if (typeof value !== 'number' || !Number.isFinite(value)) {
                                return false;
                        }
                }

                return true;
        }

        // =========================================================
        // EUCLIDEAN DISTANCE
        // =========================================================

        euclideanDistance(a: number[], b: number[]): number {
                if (!this.validateEmbedding(a) || !this.validateEmbedding(b)) {
                        return Infinity;
                }

                let sum = 0;

                for (let i = 0; i < this.EMBEDDING_SIZE; i++) {
                        const diff = a[i] - b[i];

                        sum += diff * diff;
                }

                return Math.sqrt(sum);
        }

        // =========================================================
        // COSINE SIMILARITY
        // =========================================================

        cosineSimilarity(a: number[], b: number[]): number {
                if (!this.validateEmbedding(a) || !this.validateEmbedding(b)) {
                        return 0;
                }

                let dot = 0;
                let normA = 0;
                let normB = 0;

                for (let i = 0; i < this.EMBEDDING_SIZE; i++) {
                        const av = a[i];
                        const bv = b[i];

                        dot += av * bv;
                        normA += av * av;
                        normB += bv * bv;
                }

                if (normA <= 0 || normB <= 0) {
                        return 0;
                }

                return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        }
}
