import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Camera } from '../../entities/camera.entity';
import { User } from '../../entities/users.entity';
import { FamilyMember } from '../../entities/family-member.entity';
import { CameraType, CreateCameraDto } from './dto/create-camera.dto';

@Injectable()
export class CameraService {
        constructor(
                @InjectRepository(Camera)
                private readonly cameraRepository: Repository<Camera>,
                @InjectRepository(User)
                private readonly userRepository: Repository<User>,
                @InjectRepository(FamilyMember)
                private readonly familyMemberRepository: Repository<FamilyMember>,
                private readonly dataSource: DataSource
        ) {
                console.log('Camera repository target:', this.cameraRepository.target);
                console.log(
                        'Camera metadata:',
                        this.dataSource.entityMetadatas.find(
                                (metadata) => metadata.name === 'Camera'
                        )
                );
                console.log(
                        'Registered entities:',
                        this.dataSource.entityMetadatas.map((metadata) => ({
                                name: metadata.name,
                                tableName: metadata.tableName,
                        }))
                );
        }

        async create(userId: string, dto: CreateCameraDto) {
                const user = await this.userRepository.findOne({
                        where: {
                                id: userId,
                        },
                });

                if (!user) {
                        throw new NotFoundException('Không tìm thấy người dùng');
                }

                const familyMember = await this.familyMemberRepository.findOne({
                        where: {
                                user: {
                                        id: userId,
                                },
                        },
                        relations: {
                                familyGroup: true,
                        },
                });

                const familyGroup = familyMember?.familyGroup ?? null;
                const normalizedDto = this.normalizeCameraDto(dto);

                this.validateCamera(normalizedDto);

                const camera = this.cameraRepository.create({
                        cam_name: normalizedDto.cam_name.trim(),
                        location: normalizedDto.location.trim(),
                        ip_address: normalizedDto.ip_address?.trim() || undefined,
                        camera_type: normalizedDto.camera_type,
                        status: 'inactive',
                        app_key:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.app_key?.trim()
                                        : undefined,
                        app_secret:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.app_secret?.trim()
                                        : undefined,
                        ezviz_username:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.ezviz_username?.trim()
                                        : undefined,
                        ezviz_password:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.ezviz_password
                                        : undefined,
                        device_serial:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.device_serial?.trim()
                                        : undefined,
                        verify_code:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.verify_code?.trim()
                                        : undefined,
                        imou_app_id:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_app_id?.trim()
                                        : undefined,
                        imou_app_secret:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_app_secret?.trim()
                                        : undefined,
                        imou_token:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_token?.trim()
                                        : undefined,
                        imou_device_id:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_device_id?.trim()
                                        : undefined,
                        rtsp_username: normalizedDto.rtsp_username?.trim() || undefined,
                        rtsp_password: normalizedDto.rtsp_password || undefined,
                        rtsp_port: normalizedDto.rtsp_port,
                        rtsp_channel: normalizedDto.rtsp_channel,
                        familyGroup,
                        createdBy: user,
                });

                const savedCamera = await this.cameraRepository.save(camera);

                return {
                        success: true,
                        message: 'Tạo camera thành công',
                        data: {
                                id: savedCamera.id,
                                cam_name: savedCamera.cam_name,
                                location: savedCamera.location,
                                ip_address: savedCamera.ip_address ?? null,
                                status: savedCamera.status,
                                camera_type: savedCamera.camera_type,
                                family_group_id: savedCamera.familyGroup?.id ?? null,
                                created_by: user.id,
                                created_at: savedCamera.createdAt,
                                updated_at: savedCamera.updatedAt,
                        },
                };
        }

        async getCameras(userId: string) {
                const user = await this.userRepository.findOne({
                        where: {
                                id: userId,
                        },
                });

                if (!user) {
                        throw new NotFoundException('Không tìm thấy người dùng');
                }

                const familyMembers = await this.familyMemberRepository.find({
                        where: {
                                user: {
                                        id: userId,
                                },
                        },
                        relations: {
                                familyGroup: true,
                        },
                });

                const familyGroupIds = familyMembers
                        .filter((member) => member.familyGroup)
                        .map((member) => member.familyGroup.id);

                const query = this.cameraRepository
                        .createQueryBuilder('camera')
                        .leftJoinAndSelect('camera.familyGroup', 'familyGroup')
                        .leftJoinAndSelect('camera.createdBy', 'createdBy')
                        .where('createdBy.id = :userId', { userId });

                if (familyGroupIds.length > 0) {
                        query.orWhere('familyGroup.id IN (:...familyGroupIds)', {
                                familyGroupIds,
                        });
                }

                const cameras = await query.orderBy('camera.createdAt', 'DESC').getMany();

                return {
                        success: true,
                        message: 'Lấy danh sách camera thành công',
                        data: cameras.map((camera) => {
                                const item: Record<string, any> = {
                                        id: camera.id,
                                        cam_name: camera.cam_name,
                                        location: camera.location,
                                        camera_type: camera.camera_type,
                                        status: camera.status,
                                        created_at: camera.createdAt,
                                        updated_at: camera.updatedAt,
                                };

                                // Chỉ thêm field khi có giá trị
                                if (camera.ip_address) item.ip_address = camera.ip_address;
                                if (camera.app_key) item.app_key = camera.app_key;
                                if (camera.app_secret) item.app_secret = camera.app_secret;
                                if (camera.ezviz_username)
                                        item.ezviz_username = camera.ezviz_username;
                                if (camera.device_serial) item.device_serial = camera.device_serial;
                                if (camera.verify_code) item.verify_code = camera.verify_code;
                                if (camera.imou_app_id) item.imou_app_id = camera.imou_app_id;
                                if (camera.imou_app_secret)
                                        item.imou_app_secret = camera.imou_app_secret;
                                if (camera.imou_token) item.imou_token = camera.imou_token;
                                if (camera.imou_device_id)
                                        item.imou_device_id = camera.imou_device_id;
                                if (camera.rtsp_username) item.rtsp_username = camera.rtsp_username;
                                if (camera.rtsp_password) item.rtsp_password = camera.rtsp_password;
                                if (camera.rtsp_port != null) item.rtsp_port = camera.rtsp_port;
                                if (camera.rtsp_channel != null)
                                        item.rtsp_channel = camera.rtsp_channel;
                                if (camera.familyGroup?.id)
                                        item.family_group_id = camera.familyGroup.id;
                                if (camera.createdBy?.id) item.created_by = camera.createdBy.id;
                                if (camera.createdBy?.full_name)
                                        item.created_by_name = camera.createdBy.full_name;

                                return item;
                        }),
                        meta: {
                                total: cameras.length,
                                family_group_ids: familyGroupIds,
                        },
                };
        }

        private normalizeCameraDto(dto: CreateCameraDto) {
                const raw = dto as any;

                return {
                        cam_name: raw.cam_name ?? '',
                        location: raw.location ?? '',
                        camera_type: raw.camera_type,
                        ip_address: raw.ip_address,
                        app_key: raw.ezviz_app_key ?? raw.app_key,
                        app_secret: raw.ezviz_app_secret ?? raw.app_secret,
                        ezviz_username: raw.ezviz_username,
                        ezviz_password: raw.ezviz_password,
                        device_serial: raw.ezviz_device_serial ?? raw.device_serial,
                        verify_code: raw.ezviz_verify_code ?? raw.verify_code,
                        imou_app_id: raw.imou_app_id,
                        imou_app_secret: raw.imou_app_secret,
                        imou_token: raw.imou_token,
                        imou_device_id: raw.imou_device_id,
                        rtsp_username: raw.rtsp_username,
                        rtsp_password: raw.rtsp_password,
                        rtsp_port: raw.rtsp_port,
                        rtsp_channel: raw.rtsp_channel,
                };
        }

        private validateCamera(dto: ReturnType<CameraService['normalizeCameraDto']>): void {
                if (!dto.cam_name?.trim()) {
                        throw new BadRequestException('Tên camera không được để trống');
                }

                if (!dto.location?.trim()) {
                        throw new BadRequestException('Vị trí camera không được để trống');
                }

                if (!dto.camera_type) {
                        throw new BadRequestException('Loại camera là bắt buộc');
                }

                if (dto.camera_type === CameraType.IP) {
                        if (!dto.ip_address?.trim()) {
                                throw new BadRequestException(
                                        'IP Address là bắt buộc đối với camera IP'
                                );
                        }
                }

                if (dto.camera_type === CameraType.EZVIZ) {
                        if (!dto.app_key?.trim()) {
                                throw new BadRequestException('App Key là bắt buộc');
                        }

                        if (!dto.app_secret?.trim()) {
                                throw new BadRequestException('App Secret là bắt buộc');
                        }

                        if (!dto.ezviz_username?.trim()) {
                                throw new BadRequestException('Tài khoản Ezviz là bắt buộc');
                        }

                        if (!dto.ezviz_password) {
                                throw new BadRequestException('Mật khẩu Ezviz là bắt buộc');
                        }

                        if (!dto.device_serial?.trim()) {
                                throw new BadRequestException('Device Serial là bắt buộc');
                        }

                        if (!dto.verify_code?.trim()) {
                                throw new BadRequestException('Verify Code là bắt buộc');
                        }
                }

                if (dto.camera_type === CameraType.IMOU) {
                        if (!dto.imou_app_id?.trim()) {
                                throw new BadRequestException('Imou App ID là bắt buộc');
                        }

                        if (!dto.imou_app_secret?.trim()) {
                                throw new BadRequestException('Imou App Secret là bắt buộc');
                        }

                        if (!dto.imou_device_id?.trim()) {
                                throw new BadRequestException('Imou Device ID là bắt buộc');
                        }
                }
        }

        private maskSecret(value?: string): string | undefined {
                if (!value) {
                        return value;
                }

                if (value.length <= 4) {
                        return '****';
                }

                return `${value.substring(0, 2)}****${value.substring(value.length - 2)}`;
        }
}
