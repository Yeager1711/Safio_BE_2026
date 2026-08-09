import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../../../entities/camera.entity';
import { User } from '../../../entities/users.entity';
import { FamilyMember } from '../../../entities/family-member.entity';

export interface CreateCameraDto {
        cam_name: string;
        location: string;
        camera_type?: 'IP' | 'Ezviz' | 'Imou';

        // Ezviz fields
        app_key?: string;
        app_secret?: string;
        ezviz_username?: string;
        ezviz_password?: string;
        device_serial?: string;
        verify_code?: string;

        // Imou fields
        imou_app_id?: string;
        imou_app_secret?: string;
        imou_account?: string;
        imou_password?: string;
        imou_device_id?: string;
        imou_rtsp_url?: string;

        // Other fields
        ip_address?: string;
        status?: 'active' | 'inactive';
}

@Injectable()
export class CameraService {
        constructor(
                @InjectRepository(Camera)
                private cameraRepository: Repository<Camera>,

                @InjectRepository(FamilyMember)
                private familyMemberRepository: Repository<FamilyMember>,

                @InjectRepository(User)
                private userRepository: Repository<User>
        ) {}

        async create(userId: string, data: CreateCameraDto) {
                // Kiểm tra user có thuộc Family Group không
                const familyMember = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (!familyMember || !familyMember.familyGroup) {
                        throw new BadRequestException(
                                'Bạn chưa thuộc nhóm gia đình nào. Vui lòng kết nối với người thân trước khi thêm camera.'
                        );
                }

                const camera = this.cameraRepository.create({
                        cam_name: data.cam_name?.trim(),
                        location: data.location?.trim(),
                        camera_type: data.camera_type || 'IP',
                        status: data.status || 'inactive',
                        createdBy: { id: userId }, // Relation
                        familyGroup: { id: familyMember.familyGroup.id }, // Relation

                        // Ezviz fields
                        app_key: data.app_key,
                        app_secret: data.app_secret,
                        ezviz_username: data.ezviz_username,
                        ezviz_password: data.ezviz_password,
                        device_serial: data.device_serial,
                        verify_code: data.verify_code,

                        // Imou fields
                        imou_app_id: data.imou_app_id,
                        imou_app_secret: data.imou_app_secret,
                        imou_device_id: data.imou_device_id,

                        // RTSP / Common
                        ip_address: data.ip_address,
                });

                const savedCamera = await this.cameraRepository.save(camera);

                // Lấy thêm thông tin createdBy
                const result = await this.cameraRepository.findOne({
                        where: { id: savedCamera.id },
                        relations: ['createdBy'],
                        select: {
                                id: true,
                                cam_name: true,
                                location: true,
                                camera_type: true,
                                status: true,
                                createdAt: true,
                                createdBy: {
                                        id: true,
                                        full_name: true,
                                        email: true,
                                },
                        },
                });

                return {
                        message: 'Tạo camera thành công',
                        data: result,
                };
        }

        /**
         * Lấy danh sách camera mà user có quyền xem (qua Family Group)
         */
        async getCamerasForUser(userId: string) {
                const familyMember = await this.familyMemberRepository.findOne({
                        where: { user: { id: userId } },
                        relations: ['familyGroup'],
                });

                if (!familyMember || !familyMember.familyGroup) {
                        return {
                                message: 'Người dùng chưa thuộc nhóm gia đình',
                                total: 0,
                                data: [],
                        };
                }

                const cameras = await this.cameraRepository.find({
                        where: {
                                familyGroup: { id: familyMember.familyGroup.id },
                        },
                        relations: ['createdBy'],
                        select: {
                                id: true,
                                cam_name: true,
                                location: true,
                                ip_address: true,
                                status: true,
                                camera_type: true,
                                createdAt: true,
                                createdBy: {
                                        id: true,
                                        full_name: true,
                                        email: true,
                                        phone_number: true,
                                },
                        },
                        order: { createdAt: 'DESC' },
                });

                return {
                        message: 'Lấy danh sách camera thành công',
                        total: cameras.length,
                        data: cameras,
                };
        }
}
