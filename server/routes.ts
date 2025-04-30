import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { insertUserSchema, insertDrawingSchema, insertShapeSchema, insertProjectAnalysisSchema, insertFeedbackSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Status route to test API connectivity
  app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'CAD Drawing Tool API is running' });
  });
  
  // User routes
  app.post('/api/users', async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
      }
    }
  });
  
  // Drawing routes REMOVED




  
  // Shape routes REMOVED



  
  // Project analysis routes
  app.get('/api/analyses', async (req, res) => {
    try {
      const userId = Number(req.query.userId);
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }
      
      const analyses = await storage.getUserProjectAnalyses(userId);
      res.json(analyses);
    } catch (error) {
      console.error('Error fetching project analyses:', error);
      res.status(500).json({ error: 'Failed to fetch project analyses' });
    }
  });
  
  app.get('/api/analyses/:id', async (req, res) => {
    try {
      const analysisId = Number(req.params.id);
      const analysis = await storage.getProjectAnalysis(analysisId);
      
      if (!analysis) {
        return res.status(404).json({ error: 'Project analysis not found' });
      }
      
      res.json(analysis);
    } catch (error) {
      console.error('Error fetching project analysis:', error);
      res.status(500).json({ error: 'Failed to fetch project analysis' });
    }
  });
  
  app.post('/api/analyses', async (req, res) => {
    try {
      const analysisData = insertProjectAnalysisSchema.parse(req.body);
      const analysis = await storage.createProjectAnalysis(analysisData);
      res.status(201).json(analysis);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error('Error creating project analysis:', error);
        res.status(500).json({ error: 'Failed to create project analysis' });
      }
    }
  });
  
  app.patch('/api/analyses/:id', async (req, res) => {
    try {
      const analysisId = Number(req.params.id);
      const analysisData = insertProjectAnalysisSchema.partial().parse(req.body);
      
      const updatedAnalysis = await storage.updateProjectAnalysis(analysisId, analysisData);
      
      if (!updatedAnalysis) {
        return res.status(404).json({ error: 'Project analysis not found' });
      }
      
      res.json(updatedAnalysis);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error('Error updating project analysis:', error);
        res.status(500).json({ error: 'Failed to update project analysis' });
      }
    }
  });
  
  app.delete('/api/analyses/:id', async (req, res) => {
    try {
      const analysisId = Number(req.params.id);
      const success = await storage.deleteProjectAnalysis(analysisId);
      
      if (!success) {
        return res.status(404).json({ error: 'Project analysis not found' });
      }
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting project analysis:', error);
      res.status(500).json({ error: 'Failed to delete project analysis' });
    }
  });
  
  // Feedback routes
  app.get('/api/feedbacks', async (req, res) => {
    try {
      const feedbacks = await storage.getAllFeedbacks();
      res.json(feedbacks);
    } catch (error) {
      console.error('Error fetching feedbacks:', error);
      res.status(500).json({ error: 'Failed to fetch feedbacks' });
    }
  });
  
  app.get('/api/feedbacks/:id', async (req, res) => {
    try {
      const feedbackId = Number(req.params.id);
      const feedback = await storage.getFeedback(feedbackId);
      
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback not found' });
      }
      
      res.json(feedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });
  
  app.post('/api/feedbacks', async (req, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);
      const feedback = await storage.createFeedback(feedbackData);
      res.status(201).json(feedback);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error('Error creating feedback:', error);
        res.status(500).json({ error: 'Failed to create feedback' });
      }
    }
  });
  
  app.delete('/api/feedbacks/:id', async (req, res) => {
    try {
      const feedbackId = Number(req.params.id);
      const success = await storage.deleteFeedback(feedbackId);
      
      if (!success) {
        return res.status(404).json({ error: 'Feedback not found' });
      }
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting feedback:', error);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}
