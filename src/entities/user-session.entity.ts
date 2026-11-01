import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        Index,
        ManyToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { User } from './users.entity';

@Entity('user_sessions')
@Index(['user_id', 'device_id'])
export class UserSession {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({ type: 'uuid' })
        user_id: string;

        @ManyToOne(() => User, (user) => user.sessions, {
                nullable: false,
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'user_id',
                referencedColumnName: 'id',
        })
        user: User;

        @Column({ length: 100 })
        device_id: string;

        @Column({ length: 150 })
        device_name: string;

        @Column({ length: 20 })
        device_type: string;

        @Column({ length: 50 })
        browser: string;

        @Column({ length: 50 })
        operating_system: string;

        @Column({ nullable: true, length: 45 })
        ip_address: string;

        @Column({ default: true })
        is_active: boolean;

        @CreateDateColumn()
        created_at: Date;

        @UpdateDateColumn()
        last_active_at: Date;

        @Column({
                type: 'timestamp',
                nullable: true,
        })
        revoked_at: Date | null;
}
