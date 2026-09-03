import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';
import * as wasm from '@tensorflow/tfjs-backend-wasm';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js'; // ← quan trọng
import * as canvas from 'canvas';
import * as path from 'path';
import * as fs from 'fs';

const { Canvas, Image, ImageData } = canvas;

// Monkey patch canvas cho face-api
faceapi.env.monkeyPatch({
        Canvas,
        Image,
        ImageData,
} as any);

@Injectable()
export class FaceAIService implements OnModuleInit {
        private readonly logger = new Logger(FaceAIService.name);

        private modelsLoaded = false;

        private readonly EMBEDDING_SIZE = 128;

        // DETECTOR CONFIG

        /**
         * Ảnh camera thường là 1280x720.
         *
         * Không ép thành 416x416 nữa vì sẽ làm sai
         * tỷ lệ khuôn mặt / diện tích ảnh.
         *
         * Giữ aspect ratio 16:9.
         */
        private readonly PROCESSING_WIDTH = 640;
        private readonly PROCESSING_HEIGHT = 360;

        /**
         * TinyFaceDetector input size.
         *
         * Face-api sẽ tự xử lý input canvas.
         */
        private readonly DETECTOR_INPUT_SIZE = 416;

        /**
         * Threshold TinyFaceDetector.
         */
        private readonly TINY_SCORE_THRESHOLD = 0.55;

        /**
         * SSD fallback.
         */
        private readonly SSD_MIN_CONFIDENCE = 0.5;

        /**
         * Kích thước tối thiểu của face box
         * trên canvas 640x360.
         */
        private readonly MIN_FACE_WIDTH = 90;
        private readonly MIN_FACE_HEIGHT = 90;

        /**
         * Face phải chiếm ít nhất khoảng bao nhiêu
         * chiều rộng / chiều cao ảnh.
         *
         * Đây là cách kiểm tra hợp lý hơn faceArea / imageArea.
         */
        private readonly MIN_FACE_WIDTH_RATIO = 0.1;
        private readonly MIN_FACE_HEIGHT_RATIO = 0.2;

        /**
         * Cho phép mặt lệch khỏi trung tâm.
         *
         * 0.35 = 35% kích thước ảnh.
         */
        private readonly MAX_CENTER_OFFSET_RATIO = 0.35;

        async onModuleInit() {
                try {
                        // Chỉ định đường dẫn file .wasm (có thể dùng CDN hoặc local)
                        // Cách 1: dùng CDN (đơn giản nhất)
                        wasm.setWasmPaths(
                                'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/'
                        );
                        await tf.setBackend('wasm');
                        await tf.ready();
                        this.logger.log(`TensorFlow backend: ${tf.getBackend()}`);
                        await this.loadModels();
                        this.modelsLoaded = true;
                } catch (error: any) {
                        this.modelsLoaded = false;
                        this.logger.error(
                                `FaceAI initialization failed: ${error?.message || error}`
                        );
                }
        }

        // LOAD MODELS
        private async loadModels() {
                try {
                        const modelPath = path.join(process.cwd(), 'models');

                        if (!fs.existsSync(modelPath)) {
                                this.logger.error(`Không tìm thấy thư mục models: ${modelPath}`);
                                return;
                        }

                        this.logger.log(`Loading FaceAI models from: ${modelPath}`);

                        await Promise.all([
                                faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
                                faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
                                faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
                                faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),
                        ]);

                        this.modelsLoaded = true;

                        this.logger.log('✅ FaceAI models loaded successfully');
                } catch (error: any) {
                        this.modelsLoaded = false;

                        this.logger.error(
                                `❌ Failed to load FaceAI models: ${error?.message || error}`
                        );
                }
        }

        // CREATE EMBEDDING
        async createEmbedding(imageBase64: string): Promise<number[]> {
                if (!this.modelsLoaded) {
                        throw new Error('FaceAI models chưa được load');
                }

                const startTime = Date.now();

                try {
                        // 1. VALIDATE BASE64
                        if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
                                throw new BadRequestException(
                                        'Base64 không hợp lệ hoặc thiếu prefix data:image/'
                                );
                        }

                        this.logger.debug(`Input base64 length: ${imageBase64.length}`);
                        const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');

                        if (!base64Data) {
                                throw new BadRequestException('Không có dữ liệu hình ảnh.');
                        }
                        const buffer = Buffer.from(base64Data, 'base64');
                        if (!buffer.length) {
                                throw new BadRequestException('Không thể decode ảnh Base64.');
                        }
                        this.logger.debug(`Buffer size: ${buffer.length} bytes`);

                        // 2. LOAD IMAGE
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

                        this.logger.debug(`Image loaded → ${originalWidth}x${originalHeight}`);

                        // 3. GIỮ NGUYÊN ASPECT RATIO
                        const processingWidth = this.PROCESSING_WIDTH;
                        const processingHeight = this.PROCESSING_HEIGHT;
                        const inputCanvas = canvas.createCanvas(processingWidth, processingHeight);
                        const ctx = inputCanvas.getContext('2d');

                        /**
                         * Không dùng canvas vuông.
                         *
                         * 1280x720
                         *       ↓
                         * 640x360
                         *
                         * Không distortion.
                         */
                        ctx.drawImage(img, 0, 0, processingWidth, processingHeight);
                        const input = inputCanvas as any;
                        this.logger.debug(
                                `Processed image → ${processingWidth}x${processingHeight}`
                        );

                        // 4. TINY FACE DETECTOR
                        const tinyOptions = new faceapi.TinyFaceDetectorOptions({
                                inputSize: this.DETECTOR_INPUT_SIZE,
                                scoreThreshold: this.TINY_SCORE_THRESHOLD,
                        });

                        let detections = await faceapi.detectAllFaces(input, tinyOptions);
                        this.logger.debug(`TinyFaceDetector → ${detections.length} face(s)`);

                        // 5. MULTIPLE FACE CHECK
                        if (detections.length > 1) {
                                throw new BadRequestException(
                                        'Phát hiện nhiều khuôn mặt. Vui lòng chỉ có một người trong camera.'
                                );
                        }

                        // 6. SSD FALLBACK
                        if (detections.length === 0) {
                                this.logger.warn('TinyFaceDetector không phát hiện mặt → thử SSD');

                                const ssdOptions = new faceapi.SsdMobilenetv1Options({
                                        minConfidence: this.SSD_MIN_CONFIDENCE,
                                        maxResults: 2,
                                });

                                detections = await faceapi.detectAllFaces(input, ssdOptions);
                                this.logger.debug(`SSD → ${detections.length} face(s)`);

                                if (detections.length > 1) {
                                        throw new BadRequestException(
                                                'Phát hiện nhiều khuôn mặt. Vui lòng chỉ có một người trong camera.'
                                        );
                                }
                        }

                        // 7. NO FACE
                        if (detections.length === 0) {
                                throw new BadRequestException(
                                        'Không phát hiện được khuôn mặt. Vui lòng nhìn rõ vào camera.'
                                );
                        }

                        // 8. BEST DETECTION
                        const detection = detections[0];
                        const detectionScore = detection.score;
                        this.logger.debug(`Face detection score: ${detectionScore.toFixed(4)}`);

                        // 9. SCORE CHECK
                        if (
                                !Number.isFinite(detectionScore) ||
                                detectionScore < this.TINY_SCORE_THRESHOLD
                        ) {
                                throw new BadRequestException(
                                        `Độ tin cậy phát hiện khuôn mặt quá thấp (${detectionScore.toFixed(
                                                2
                                        )}). Vui lòng đưa khuôn mặt rõ hơn vào camera.`
                                );
                        }

                        // 10. FACE BOX
                        const box = detection.box;
                        const faceWidth = box.width;
                        const faceHeight = box.height;
                        const faceCenterX = box.x + box.width / 2;
                        const faceCenterY = box.y + box.height / 2;

                        this.logger.debug(
                                [
                                        `Face box →`,
                                        `x=${box.x.toFixed(1)}`,
                                        `y=${box.y.toFixed(1)}`,
                                        `w=${faceWidth.toFixed(1)}`,
                                        `h=${faceHeight.toFixed(1)}`,
                                ].join(', ')
                        );

                        // 11. FACE SIZE CHECK
                        if (faceWidth < this.MIN_FACE_WIDTH || faceHeight < this.MIN_FACE_HEIGHT) {
                                throw new BadRequestException(
                                        'Khuôn mặt quá nhỏ. Vui lòng đưa mặt lại gần camera.'
                                );
                        }

                        const faceWidthRatio = faceWidth / processingWidth;
                        const faceHeightRatio = faceHeight / processingHeight;

                        this.logger.debug(
                                [
                                        `Face size ratio →`,
                                        `width=${faceWidthRatio.toFixed(4)}`,
                                        `height=${faceHeightRatio.toFixed(4)}`,
                                ].join(', ')
                        );

                        if (
                                faceWidthRatio < this.MIN_FACE_WIDTH_RATIO ||
                                faceHeightRatio < this.MIN_FACE_HEIGHT_RATIO
                        ) {
                                throw new BadRequestException(
                                        'Khuôn mặt quá nhỏ. Vui lòng đưa mặt lại gần camera.'
                                );
                        }

                        // 13. FACE CENTER CHECK

                        const imageCenterX = processingWidth / 2;
                        const imageCenterY = processingHeight / 2;
                        const offsetX = Math.abs(faceCenterX - imageCenterX) / processingWidth;
                        const offsetY = Math.abs(faceCenterY - imageCenterY) / processingHeight;

                        this.logger.debug(
                                [
                                        `Face center offset →`,
                                        `x=${offsetX.toFixed(4)}`,
                                        `y=${offsetY.toFixed(4)}`,
                                ].join(', ')
                        );

                        if (
                                offsetX > this.MAX_CENTER_OFFSET_RATIO ||
                                offsetY > this.MAX_CENTER_OFFSET_RATIO
                        ) {
                                throw new BadRequestException(
                                        'Khuôn mặt nằm quá lệch khỏi camera. Vui lòng đưa mặt vào giữa khung hình.'
                                );
                        }

                        // 14. RECOGNITION

                        /**
                         * Chỉ chạy landmark + descriptor
                         * sau khi quality check pass.
                         */

                        let faceResult = await faceapi
                                .detectSingleFace(input, tinyOptions)
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                        // 15. SSD RECOGNITION FALLBACK
                        if (!faceResult) {
                                this.logger.warn(
                                        'Tiny recognition pipeline failed → trying SSD recognition'
                                );

                                const ssdRecognitionOptions = new faceapi.SsdMobilenetv1Options({
                                        minConfidence: this.SSD_MIN_CONFIDENCE,
                                        maxResults: 1,
                                });

                                faceResult = await faceapi
                                        .detectSingleFace(input, ssdRecognitionOptions)
                                        .withFaceLandmarks()
                                        .withFaceDescriptor();
                        }

                        // 16. RECOGNITION FAILED
                        if (!faceResult) {
                                throw new BadRequestException(
                                        'Không thể phân tích khuôn mặt. Vui lòng giữ mặt rõ và thử lại.'
                                );
                        }

                        // 17. FINALIZE
                        return this.finalizeEmbedding(
                                faceResult.descriptor,
                                faceResult.detection.score,
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

        // FINALIZE EMBEDDING
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

                // EMBEDDING NOR
                const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));

                if (!Number.isFinite(norm) || norm < 0.01) {
                        throw new BadRequestException('Face embedding không đủ chất lượng.');
                }

                const elapsed = Date.now() - startTime;

                this.logger.debug(
                        [
                                `Face descriptor generated →`,
                                `size=${embedding.length}`,
                                `norm=${norm.toFixed(4)}`,
                                `detection=${detectionScore.toFixed(4)}`,
                                `time=${elapsed}ms`,
                        ].join(', ')
                );

                return embedding;
        }

        // VALIDATE EMBEDDING
        validateEmbedding(embedding: number[] | null | undefined): boolean {
                if (!embedding || !Array.isArray(embedding)) {
                        return false;
                }

                if (embedding.length !== this.EMBEDDING_SIZE) {
                        return false;
                }

                if (
                        embedding.some(
                                (value) => typeof value !== 'number' || !Number.isFinite(value)
                        )
                ) {
                        return false;
                }

                return true;
        }

        // EUCLIDEAN DISTANCE
        euclideanDistance(a: number[], b: number[]): number {
                if (!this.validateEmbedding(a) || !this.validateEmbedding(b)) {
                        return Infinity;
                }

                let sum = 0;
                for (let i = 0; i < a.length; i++) {
                        const diff = a[i] - b[i];
                        sum += diff * diff;
                }

                return Math.sqrt(sum);
        }

        // COSINE SIMILARITY
        cosineSimilarity(a: number[], b: number[]): number {
                if (!a || !b || a.length !== b.length) {
                        return 0;
                }

                let dot = 0;
                let normA = 0;
                let normB = 0;

                for (let i = 0; i < a.length; i++) {
                        dot += a[i] * b[i];
                        normA += a[i] * a[i];
                        normB += b[i] * b[i];
                }

                if (normA === 0 || normB === 0) {
                        return 0;
                }

                return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        }
}
