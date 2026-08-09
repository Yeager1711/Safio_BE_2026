import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('warning_types')
export class WarningType {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column()
        level: string; // Low, Medium, High, Critical

        @Column({ nullable: true })
        description?: string;
}
