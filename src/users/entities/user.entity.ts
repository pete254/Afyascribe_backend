// src/users/entities/user.entity.ts - UPDATED WITH 6-DIGIT CODE FIELDS
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SoapNote } from '../../soap-notes/entities/soap-note.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: ['doctor', 'nurse', 'admin'], default: 'doctor' })
  role: string;

  @Column({ default: true })
  isActive: boolean;

  // ✅ OLD TOKEN-BASED FIELDS (kept for backward compatibility)
  @Column({ nullable: true, type: 'varchar', length: 255 })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires: Date | null;

  // ✅ NEW: 6-DIGIT CODE FIELDS
  @Column({ nullable: true, type: 'varchar', length: 6 })
  resetCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetCodeExpiresAt: Date | null;

  @Column({ type: 'int', default: 0 })
  resetCodeAttempts: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SoapNote, (soapNote: SoapNote) => soapNote.createdBy)
  soapNotes: SoapNote[];
}