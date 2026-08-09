import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs';
import * as canvas from 'canvas';
import * as path from 'path';
import * as fs from 'fs';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

@Injectable()
export class FaceAIService implements OnModuleInit {
        private readonly logger = new Logger(FaceAIService.name);
        private modelsLoaded = false;
        private readonly EMBEDDING_SIZE = 128;

        async onModuleInit() {
                await tf.setBackend('cpu');
                await tf.ready();
                this.logger.log(`TensorFlow backend: ${tf.getBackend()}`);
                await this.loadModels();
        }
        private async loadModels() {
                try {
                        const modelPath = path.join(process.cwd(), 'models');

                        if (!fs.existsSync(modelPath)) {
                                this.logger.error(`Không tìm thấy thư mục models: ${modelPath}`);
                                return;
                        }

                        await Promise.all([
                                faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath),
                                faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
                                faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath),
                                faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),
                        ]);

                        this.modelsLoaded = true;
                        this.logger.log('✅ FaceAI models loaded successfully');
                } catch (error: any) {
                        this.logger.error(
                                '❌ Failed to load FaceAI models',
                                error?.message || error
                        );
                        this.modelsLoaded = false;
                }
        }

        async createEmbedding(imageBase64: string): Promise<number[]> {
                if (!this.modelsLoaded) {
                        throw new Error('FaceAI models chưa được load');
                }

                try {
                        this.logger.debug(`Input base64 length: ${imageBase64?.length || 0}`);

                        if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
                                throw new Error(
                                        'Base64 không hợp lệ hoặc thiếu prefix data:image/'
                                );
                        }

                        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');

                        this.logger.debug(`Buffer size: ${buffer.length} bytes`);

                        const img = await canvas.loadImage(buffer);
                        this.logger.debug(
                                `Image loaded → width: ${img.width}, height: ${img.height}`
                        );

                        // ========== RESIZE VỀ VUÔNG (quan trọng) ==========
                        const size = 416; // TinyFaceDetector thích 416
                        const c = canvas.createCanvas(size, size);
                        const ctx = c.getContext('2d');

                        // Vẽ nền đen
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, size, size);

                        // Giữ tỷ lệ và căn giữa
                        const scale = Math.min(size / img.width, size / img.height);
                        const w = Math.round(img.width * scale);
                        const h = Math.round(img.height * scale);
                        const x = Math.round((size - w) / 2);
                        const y = Math.round((size - h) / 2);

                        ctx.drawImage(img, x, y, w, h);
                        const input = c as any;

                        this.logger.debug(`Resized to square → ${size}x${size}`);

                        // ========== DETECT ==========
                        // Ưu tiên TinyFaceDetector
                        let detection = await faceapi
                                .detectSingleFace(
                                        input,
                                        new faceapi.TinyFaceDetectorOptions({
                                                inputSize: 416,
                                                scoreThreshold: 0.6, 
                                        })
                                )
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                        // Fallback SSD
                        if (!detection) {
                                this.logger.warn('TinyFaceDetector fail → thử SsdMobilenetv1');
                                detection = await faceapi
                                        .detectSingleFace(
                                                input,
                                                new faceapi.SsdMobilenetv1Options({
                                                        minConfidence: 0.15,
                                                        maxResults: 1,
                                                })
                                        )
                                        .withFaceLandmarks()
                                        .withFaceDescriptor();
                        }

                        if (!detection) {
                                // Thử lại với ảnh gốc (không resize)
                                this.logger.warn('Thử lại với ảnh gốc...');
                                detection = await faceapi
                                        .detectSingleFace(
                                                img as any,
                                                new faceapi.SsdMobilenetv1Options({
                                                        minConfidence: 0.15,
                                                        maxResults: 1,
                                                })
                                        )
                                        .withFaceLandmarks()
                                        .withFaceDescriptor();
                        }

                        if (!detection) {
                                const all = await faceapi.detectAllFaces(
                                        input,
                                        new faceapi.TinyFaceDetectorOptions({
                                                inputSize: 416,
                                                scoreThreshold: 0.1,
                                        })
                                );
                                this.logger.warn(
                                        `detectSingleFace = null | detectAllFaces count = ${all.length}`
                                );
                                throw new Error('Không phát hiện được khuôn mặt trong ảnh');
                        }

                        this.logger.debug(
                                `Face detected → score: ${detection.detection.score.toFixed(4)}`
                        );

                        const embedding = Array.from(detection.descriptor) as number[];

                        if (!this.validateEmbedding(embedding)) {
                                throw new Error('Embedding không hợp lệ');
                        }

                        return embedding;
                } catch (error: any) {
                        this.logger.error(`createEmbedding error: ${error?.message || error}`);
                        throw error;
                }
        }

        validateEmbedding(embedding: number[] | null | undefined): boolean {
                if (!embedding || !Array.isArray(embedding)) return false;
                if (embedding.length !== this.EMBEDDING_SIZE) return false;
                if (embedding.some((v) => typeof v !== 'number' || Number.isNaN(v))) return false;
                return true;
        }

        cosineSimilarity(a: number[], b: number[]): number {
                if (!a || !b || a.length !== b.length) return 0;

                let dot = 0;
                let normA = 0;
                let normB = 0;

                for (let i = 0; i < a.length; i++) {
                        dot += a[i] * b[i];
                        normA += a[i] * a[i];
                        normB += b[i] * b[i];
                }

                if (normA === 0 || normB === 0) return 0;
                return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        }
}
