import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ActiveLog } from './active_logs.entity';
import { Relative } from './relatives.entity';

@Entity('notifications')
export class Notification {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @ManyToOne(() => ActiveLog, { nullable: false })
        @JoinColumn({ name: 'log_id' })
        activeLog: ActiveLog;

        @ManyToOne(() => Relative, { nullable: false })
        @JoinColumn({ name: 'relative_id' })
        relative: Relative;

        @Column({ default: () => 'CURRENT_TIMESTAMP' })
        sent_at: Date;

        @Column({
                type: 'enum',
                enum: ['sent', 'delivered', 'read', 'failed'],
                default: 'sent',
        })
        status: string;
}
