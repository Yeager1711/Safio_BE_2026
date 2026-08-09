import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

interface AlertData {
        camId: number;
        camName: string;
        timestamp: string;
        snapshot: string;
        fallType: string;
        behavior: string;
}

@Injectable()
export class FallWarningService {
        private transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                        user: process.env.GOOGLE_EMAIL,
                        pass: process.env.GOOGLE_APP_PASSWORD,
                },
        });

        private async sendEmail(options: {
                subject: string;
                html: string;
                snapshotBase64?: string;
                cid: string;
        }) {
                const mailOptions: any = {
                        from: `"AI Care System" <${process.env.GOOGLE_EMAIL}>`,
                        to: 'namhp1711@gmail.com',
                        subject: options.subject,
                        html: options.html,
                };

                if (options.snapshotBase64) {
                        const imageBuffer = Buffer.from(
                                options.snapshotBase64.replace(/^data:image\/\w+;base64,/, ''),
                                'base64'
                        );
                        mailOptions.attachments = [
                                {
                                        filename: 'snapshot.png',
                                        content: imageBuffer,
                                        encoding: 'base64',
                                        cid: options.cid,
                                },
                        ];
                }

                await this.transporter.sendMail(mailOptions);
        }

        // MỨC 1
        async sendAlertLevel1(data: AlertData) {
                const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #ff9800; padding: 16px; border-radius: 8px;">
        <h2 style="color: #f57c00; margin:0;">CẢNH BÁO TÉ NGÃ (MỨC 1)</h2>
        <p><strong>Camera:</strong> ${data.camName} (ID: ${data.camId})</p>
        <p><strong>Thời gian:</strong> ${data.timestamp}</p>
        <p><strong>Loại:</strong> ${data.fallType}</p>
        <p><strong>Hành vi:</strong> ${data.behavior}</p>
        <hr>
        <p style="color: #e65100;">Vui lòng kiểm tra người giám sát ngay.</p>
        ${data.snapshot ? '<img src="cid:alert1_snapshot" style="max-width:100%; border-radius:8px; margin-top:12px;">' : ''}
      </div>`;

                await this.sendEmail({
                        subject: `[MỨC 1] Té ngã - ${data.camName}`,
                        html,
                        snapshotBase64: data.snapshot,
                        cid: 'alert1_snapshot',
                });
        }

        // MỨC 2
        async sendAlertLevel2(data: AlertData) {
                const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 2px solid #e53935; padding: 16px; border-radius: 8px; background: #ffebee;">
        <h2 style="color: #d32f2f; margin:0;">MỨC 2: CHƯA ĐỨNG DẬY </h2>
        <p><strong>Camera:</strong> ${data.camName} (ID: ${data.camId})</p>
        <p><strong>Thời gian:</strong> ${data.timestamp}</p>
        <p><strong>Tình trạng:</strong> ${data.fallType}</p>
        <p><strong>Chi tiết:</strong> ${data.behavior}</p>
        <hr>
        <p style="color: #c62828; font-weight: bold;">
          CẦN CAN THIỆP NGAY — NGƯỜI GIÁM SÁT CHƯA PHỤC HỒI
        </p>
        ${data.snapshot ? '<img src="cid:alert2_snapshot" style="max-width:100%; border-radius:8px; margin-top:12px;">' : ''}
      </div>`;

                await this.sendEmail({
                        subject: `[MỨC 2] Chưa phục hồi - ${data.camName}`,
                        html,
                        snapshotBase64: data.snapshot,
                        cid: 'alert2_snapshot',
                });
        }

        // MỨC 3
        async sendAlertLevel3(data: AlertData) {
                const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 3px solid #b71c1c; padding: 20px; border-radius: 12px; background: #ffebee;">
        <h2 style="color: #b71c1c; margin:0; font-size: 24px;">KHẨN CẤP MỨC 3: NGUY HIỂM TÍNH MẠNG</h2>
        <p><strong>Camera:</strong> ${data.camName} (ID: ${data.camId})</p>
        <p><strong>Thời gian:</strong> ${data.timestamp}</p>
        <p><strong>Tình trạng:</strong> ${data.fallType}</p>
        <p><strong>Chi tiết:</strong> ${data.behavior}</p>
        <hr style="border-color: #b71c1c;">
        <p style="color: #b71c1c; font-weight: bold; font-size: 18px;">
          GỌI CỨU THƯƠNG NGAY! NGƯỜI GIÁM SÁT CÓ THỂ BẤT TỈNH
        </p>
        ${data.snapshot ? '<img src="cid:alert3_snapshot" style="max-width:100%; border-radius:8px; margin-top:12px; border: 2px solid #b71c1c;">' : ''}
      </div>`;

                await this.sendEmail({
                        subject: `[KHẨN CẤP MỨC 3] CỨU NGƯỜI NGAY - ${data.camName}`,
                        html,
                        snapshotBase64: data.snapshot,
                        cid: 'alert3_snapshot',
                });
        }

        // PHỤC HỒI
        async sendRecoveryEmail(data: {
                camId: number;
                camName: string;
                timestamp: string;
                recovered: boolean;
        }) {
                const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 2px solid #388e3c; padding: 16px; border-radius: 8px; background: #e8f5e9;">
        <h2 style="color: #2e7d32; margin:0;">ĐÃ PHỤC HỒI AN TOÀN</h2>
        <p><strong>Camera:</strong> ${data.camName} (ID: ${data.camId})</p>
        <p><strong>Thời gian phục hồi:</strong> ${data.timestamp}</p>
        <hr>
        <p style="color: #1b5e20; font-weight: bold;">
          Người giám sát đã đứng dậy. Tình huống đã được kiểm soát.
        </p>
      </div>`;

                await this.sendEmail({
                        subject: `[AN TOÀN] Phục hồi - ${data.camName}`,
                        html,
                        snapshotBase64: undefined,
                        cid: 'recovery',
                });
        }
}
