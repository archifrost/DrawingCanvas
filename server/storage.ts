import { users, drawings, shapes, projectAnalyses, feedbacks, type User, type InsertUser, type Drawing, type InsertDrawing, type Shape, type InsertShape, type ProjectAnalysis, type InsertProjectAnalysis, type Feedback, type InsertFeedback } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

// Storage interface with CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Drawing methods
  getDrawing(id: number): Promise<Drawing | undefined>;
  getUserDrawings(userId: number): Promise<Drawing[]>;
  createDrawing(drawing: InsertDrawing): Promise<Drawing>;
  updateDrawing(id: number, drawing: Partial<InsertDrawing>): Promise<Drawing | undefined>;
  deleteDrawing(id: number): Promise<boolean>;
  
  // Shape methods
  getShape(id: number): Promise<Shape | undefined>;
  getDrawingShapes(drawingId: number): Promise<Shape[]>;
  createShape(shape: InsertShape): Promise<Shape>;
  updateShape(id: number, shape: Partial<InsertShape>): Promise<Shape | undefined>;
  deleteShape(id: number): Promise<boolean>;
  
  // ProjectAnalysis methods
  getProjectAnalysis(id: number): Promise<ProjectAnalysis | undefined>;
  getUserProjectAnalyses(userId: number): Promise<ProjectAnalysis[]>;
  createProjectAnalysis(analysis: InsertProjectAnalysis): Promise<ProjectAnalysis>;
  updateProjectAnalysis(id: number, analysis: Partial<InsertProjectAnalysis>): Promise<ProjectAnalysis | undefined>;
  deleteProjectAnalysis(id: number): Promise<boolean>;
  
  // Feedback methods
  getFeedback(id: number): Promise<Feedback | undefined>;
  getAllFeedbacks(): Promise<Feedback[]>;
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  deleteFeedback(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Drawing methods REMOVED
  
  // Shape methods REMOVED
  
  // ProjectAnalysis methods
  async getProjectAnalysis(id: number): Promise<ProjectAnalysis | undefined> {
    const [analysis] = await db.select().from(projectAnalyses).where(eq(projectAnalyses.id, id));
    return analysis;
  }
  
  async getUserProjectAnalyses(userId: number): Promise<ProjectAnalysis[]> {
    return await db.select().from(projectAnalyses).where(eq(projectAnalyses.userId, userId));
  }
  
  async createProjectAnalysis(analysis: InsertProjectAnalysis): Promise<ProjectAnalysis> {
    const [newAnalysis] = await db.insert(projectAnalyses).values(analysis).returning();
    return newAnalysis;
  }
  
  async updateProjectAnalysis(id: number, analysis: Partial<InsertProjectAnalysis>): Promise<ProjectAnalysis | undefined> {
    const [updatedAnalysis] = await db
      .update(projectAnalyses)
      .set(analysis)
      .where(eq(projectAnalyses.id, id))
      .returning();
    return updatedAnalysis;
  }
  
  async deleteProjectAnalysis(id: number): Promise<boolean> {
    const result = await db.delete(projectAnalyses).where(eq(projectAnalyses.id, id)).returning({ id: projectAnalyses.id });
    return result.length > 0;
  }
  
  // Feedback methods
  async getFeedback(id: number): Promise<Feedback | undefined> {
    const [feedback] = await db.select().from(feedbacks).where(eq(feedbacks.id, id));
    return feedback;
  }
  
  async getAllFeedbacks(): Promise<Feedback[]> {
    return await db.select().from(feedbacks);
  }
  
  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const [newFeedback] = await db.insert(feedbacks).values(feedback).returning();
    return newFeedback;
  }
  
  async deleteFeedback(id: number): Promise<boolean> {
    const result = await db.delete(feedbacks).where(eq(feedbacks.id, id)).returning({ id: feedbacks.id });
    return result.length > 0;
  }
}

// Export a single instance of the storage
export const storage = new DatabaseStorage();
