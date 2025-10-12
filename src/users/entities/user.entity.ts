// src/users/entities/user.entity.ts 
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

  // ✅ NEW: Password reset fields
  @Column({ nullable: true, type: 'varchar', length: 255 })
  resetPasswordToken: string | null;  // ✅ Added | null

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires: Date | null;  // ✅ Added | null

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SoapNote, (soapNote: SoapNote) => soapNote.createdBy)
  soapNotes: SoapNote[];
}