import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DataSource } from 'typeorm';

import { Camera } from '../../entities/camera.entity';

import { User } from '../../entities/users.entity';

import { FamilyMember } from '../../entities/family-member.entity';

import { CameraType, CreateCameraDto } from './dto/create-camera.dto';

import { EncryptionService } from './encryption.service';

@Injectable()
export class CameraService {
        constructor(
                @InjectRepository(Camera)
                private readonly cameraRepository: Repository<Camera>,

                @InjectRepository(User)
                private readonly userRepository: Repository<User>,

                @InjectRepository(FamilyMember)
                private readonly familyMemberRepository: Repository<FamilyMember>,

                private readonly dataSource: DataSource,

                private readonly encryptionService: EncryptionService
        ) {}

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

                        /*
                         * ================================
                         * EZVIZ
                         * ================================
                         */

                        app_key:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.app_key?.trim()
                                          )
                                        : undefined,

                        app_secret:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.app_secret?.trim()
                                          )
                                        : undefined,

                        ezviz_username:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? normalizedDto.ezviz_username?.trim()
                                        : undefined,

                        ezviz_password:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.ezviz_password
                                          )
                                        : undefined,

                        device_serial:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.device_serial?.trim()
                                          )
                                        : undefined,

                        verify_code:
                                normalizedDto.camera_type === CameraType.EZVIZ
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.verify_code?.trim()
                                          )
                                        : undefined,

                        /*
                         * ================================
                         * IMOU
                         * ================================
                         */

                        imou_app_id:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_app_id?.trim()
                                        : undefined,

                        imou_app_secret:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.imou_app_secret?.trim()
                                          )
                                        : undefined,

                        imou_token:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? this.encryptionService.encrypt(
                                                  normalizedDto.imou_token?.trim()
                                          )
                                        : undefined,

                        imou_device_id:
                                normalizedDto.camera_type === CameraType.IMOU
                                        ? normalizedDto.imou_device_id?.trim()
                                        : undefined,

                        /*
                         * ================================
                         * RTSP
                         * ================================
                         */

                        rtsp_username: normalizedDto.rtsp_username?.trim() || undefined,

                        rtsp_password: this.encryptionService.encrypt(normalizedDto.rtsp_password),

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

                                /*
                                 * Không trả credential.
                                 */
                                credentials_configured: this.hasConfiguredCredentials(savedCamera),
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

                        .where('createdBy.id = :userId', {
                                userId,
                        });

                if (familyGroupIds.length > 0) {
                        query.orWhere('familyGroup.id IN (:...familyGroupIds)', {
                                familyGroupIds,
                        });
                }

                const cameras = await query.orderBy('camera.createdAt', 'DESC').getMany();

                const activeCount = cameras.filter((camera) => camera.status === 'active').length;

                const inactiveCount = cameras.filter(
                        (camera) => camera.status === 'inactive'
                ).length;

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

                                        credentials_configured:
                                                this.hasConfiguredCredentials(camera),
                                };

                                if (camera.ip_address) {
                                        item.ip_address = camera.ip_address;
                                }

                                if (camera.camera_type === CameraType.EZVIZ) {
                                        item.app_key = this.encryptionService.safeDecrypt(
                                                camera.app_key
                                        );

                                        item.app_secret = this.encryptionService.safeDecrypt(
                                                camera.app_secret
                                        );

                                        item.ezviz_username = camera.ezviz_username ?? null;

                                        item.ezviz_password = this.encryptionService.safeDecrypt(
                                                camera.ezviz_password
                                        );

                                        item.device_serial = this.encryptionService.safeDecrypt(
                                                camera.device_serial
                                        );

                                        item.verify_code = this.encryptionService.safeDecrypt(
                                                camera.verify_code
                                        );
                                }

                                if (camera.camera_type === CameraType.IMOU) {
                                        item.imou_app_id = camera.imou_app_id ?? null;

                                        item.imou_app_secret = this.encryptionService.safeDecrypt(
                                                camera.imou_app_secret
                                        );

                                        item.imou_token = this.encryptionService.safeDecrypt(
                                                camera.imou_token
                                        );

                                        item.imou_device_id = camera.imou_device_id ?? null;
                                }

                                if (camera.rtsp_username) {
                                        item.rtsp_username = camera.rtsp_username;
                                }

                                if (camera.rtsp_password) {
                                        item.rtsp_password = this.encryptionService.safeDecrypt(
                                                camera.rtsp_password
                                        );
                                }

                                if (camera.rtsp_port != null) {
                                        item.rtsp_port = camera.rtsp_port;
                                }

                                if (camera.rtsp_channel != null) {
                                        item.rtsp_channel = camera.rtsp_channel;
                                }

                                if (camera.camera_type === CameraType.IMOU) {
                                        item.imou_app_id = camera.imou_app_id ?? null;

                                        item.imou_app_secret = camera.imou_app_secret
                                                ? this.encryptionService.decrypt(
                                                          camera.imou_app_secret
                                                  )
                                                : null;

                                        item.imou_token = camera.imou_token
                                                ? this.encryptionService.decrypt(camera.imou_token)
                                                : null;

                                        item.imou_device_id = camera.imou_device_id ?? null;
                                }

                                if (camera.rtsp_username) {
                                        item.rtsp_username = camera.rtsp_username;
                                }

                                if (camera.rtsp_password) {
                                        item.rtsp_password = this.encryptionService.decrypt(
                                                camera.rtsp_password
                                        );
                                }

                                if (camera.rtsp_port != null) {
                                        item.rtsp_port = camera.rtsp_port;
                                }

                                if (camera.rtsp_channel != null) {
                                        item.rtsp_channel = camera.rtsp_channel;
                                }

                                if (camera.familyGroup?.id) {
                                        item.family_group_id = camera.familyGroup.id;
                                }

                                if (camera.createdBy?.id) {
                                        item.created_by = camera.createdBy.id;
                                }

                                if (camera.createdBy?.full_name) {
                                        item.created_by_name = camera.createdBy.full_name;
                                }

                                return item;
                        }),

                        meta: {
                                total: cameras.length,

                                active: activeCount,

                                inactive: inactiveCount,

                                family_group_ids: familyGroupIds,
                        },
                };
        }

        async updateCameraStatus(userId: string, cameraId: string, status: 'active' | 'inactive') {
                if (status !== 'active' && status !== 'inactive') {
                        throw new BadRequestException('Trạng thái camera không hợp lệ');
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
                        .where('camera.id = :cameraId', {
                                cameraId,
                        })
                        .andWhere(
                                `(createdBy.id = :userId${
                                        familyGroupIds.length > 0
                                                ? ' OR familyGroup.id IN (:...familyGroupIds)'
                                                : ''
                                })`,
                                familyGroupIds.length > 0
                                        ? {
                                                  userId,
                                                  familyGroupIds,
                                          }
                                        : {
                                                  userId,
                                          }
                        );

                const camera = await query.getOne();

                if (!camera) {
                        throw new NotFoundException(
                                'Không tìm thấy camera hoặc bạn không có quyền thay đổi camera này'
                        );
                }

                camera.status = status;

                const savedCamera = await this.cameraRepository.save(camera);

                return {
                        success: true,
                        message: status === 'active' ? 'Đã bật camera' : 'Đã tắt camera',
                        data: {
                                id: savedCamera.id,
                                status: savedCamera.status,
                                updated_at: savedCamera.updatedAt,
                        },
                };
        }

        /* =============* LẤY CREDENTIAL CHO BACKEND * ================
         * Chỉ những service backend như:
         * EzvizService
         * ImouService
         * RTSPService
         * nên sử dụng.
         */

        async getCameraCredentials(userId: string, cameraId: string) {
                const camera = await this.cameraRepository
                        .createQueryBuilder('camera')

                        .leftJoinAndSelect('camera.familyGroup', 'familyGroup')

                        .leftJoinAndSelect('camera.createdBy', 'createdBy')

                        .where('camera.id = :cameraId', {
                                cameraId,
                        })

                        .andWhere(
                                '(createdBy.id = :userId OR familyGroup.id IN (' +
                                        'SELECT fm.family_group_id ' +
                                        'FROM family_members fm ' +
                                        'WHERE fm.user_id = :userId' +
                                        '))',
                                {
                                        userId,
                                }
                        )

                        .getOne();

                if (!camera) {
                        throw new NotFoundException(
                                'Không tìm thấy camera hoặc bạn không có quyền truy cập'
                        );
                }

                return {
                        id: camera.id,

                        camera_type: camera.camera_type,

                        /*
                         * EZVIZ
                         */
                        ...(camera.camera_type === CameraType.EZVIZ
                                ? {
                                          app_key: this.encryptionService.decrypt(camera.app_key),

                                          app_secret: this.encryptionService.decrypt(
                                                  camera.app_secret
                                          ),

                                          ezviz_username: camera.ezviz_username,

                                          ezviz_password: this.encryptionService.decrypt(
                                                  camera.ezviz_password
                                          ),

                                          device_serial: this.encryptionService.decrypt(
                                                  camera.device_serial
                                          ),

                                          verify_code: this.encryptionService.decrypt(
                                                  camera.verify_code
                                          ),
                                  }
                                : {}),

                        /*
                         * IMOU
                         */
                        ...(camera.camera_type === CameraType.IMOU
                                ? {
                                          imou_app_id: camera.imou_app_id,

                                          imou_app_secret: this.encryptionService.decrypt(
                                                  camera.imou_app_secret
                                          ),

                                          imou_token: this.encryptionService.decrypt(
                                                  camera.imou_token
                                          ),

                                          imou_device_id: camera.imou_device_id,
                                  }
                                : {}),

                        /*
                         * RTSP / IP
                         */
                        ip_address: camera.ip_address,

                        rtsp_username: camera.rtsp_username,

                        rtsp_password: this.encryptionService.decrypt(camera.rtsp_password),

                        rtsp_port: camera.rtsp_port,

                        rtsp_channel: camera.rtsp_channel,
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

                /*
                 * ================================
                 * IP
                 * ================================
                 */

                if (dto.camera_type === CameraType.IP) {
                        if (!dto.ip_address?.trim()) {
                                throw new BadRequestException(
                                        'IP Address là bắt buộc đối với camera IP'
                                );
                        }
                }

                /*
                 * ================================
                 * EZVIZ
                 * ================================
                 */

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

                /*
                 * ================================
                 * IMOU
                 * ================================
                 */

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

        private hasConfiguredCredentials(camera: Camera): boolean {
                switch (camera.camera_type) {
                        case CameraType.EZVIZ:
                                return Boolean(
                                        camera.app_key &&
                                        camera.app_secret &&
                                        camera.ezviz_username &&
                                        camera.ezviz_password &&
                                        camera.device_serial &&
                                        camera.verify_code
                                );

                        case CameraType.IMOU:
                                return Boolean(
                                        camera.imou_app_id &&
                                        camera.imou_app_secret &&
                                        camera.imou_device_id &&
                                        (camera.imou_token || camera.imou_app_secret)
                                );

                        case CameraType.IP:
                                return Boolean(camera.ip_address);

                        default:
                                return Boolean(camera.rtsp_username && camera.rtsp_password);
                }
        }
}
