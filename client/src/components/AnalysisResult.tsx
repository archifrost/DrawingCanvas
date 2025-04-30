import React from 'react';
import { ProjectDetails } from '@/lib/geminiService';
import { Separator } from '@/components/ui/separator';

interface AnalysisResultProps {
  data: ProjectDetails;
}

export default function AnalysisResult({ data }: AnalysisResultProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto mt-8">
      <h2 className="text-2xl font-bold text-center mb-6">İmar Belgesi Analiz Sonuçları</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">Genel Bilgiler</h3>
          <div className="space-y-2">
            <InfoItem label="İl" value={data.city} />
            <InfoItem label="İlçe" value={data.district} />
            <InfoItem label="Mahalle" value={data.neighborhood} />
            <InfoItem label="Ada" value={data.block} />
            <InfoItem label="Parsel" value={data.parcel} />
            <InfoItem label="Arsa Alanı" value={data.land_area ? `${data.land_area} m²` : null} />
            <InfoItem label="Malik" value={data.owner} />
            <InfoItem label="Pafta No" value={data.sheet_no} />
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-3">Yapılaşma Koşulları</h3>
          <div className="space-y-2">
            <InfoItem label="İnşaat Nizamı" value={data.building_order} />
            <InfoItem label="Planındaki Konumu" value={data.plan_position} />
            <InfoItem label="Kat Adedi" value={data.floor_count} />
            <InfoItem label="TAKS" value={data.ground_coverage_ratio?.toString()} />
            <InfoItem label="Emsal" value={data.floor_area_ratio?.toString()} />
            <InfoItem label="Çatı Tipi" value={data.roof_type} />
            <InfoItem label="Çatı Eğimi" value={data.roof_angle ? `${data.roof_angle}°` : null} />
          </div>
        </div>
      </div>
      
      <Separator className="my-6" />
      
      <div>
        <h3 className="text-lg font-semibold mb-3">Mesafeler</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-md text-center">
            <div className="text-lg font-medium">Ön Bahçe</div>
            <div className="text-2xl font-bold text-blue-600">{data.front_setback ? `${data.front_setback} m` : 'Belirtilmemiş'}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-md text-center">
            <div className="text-lg font-medium">Yan Bahçe</div>
            <div className="text-2xl font-bold text-blue-600">{data.side_setback ? `${data.side_setback} m` : 'Belirtilmemiş'}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-md text-center">
            <div className="text-lg font-medium">Arka Bahçe</div>
            <div className="text-2xl font-bold text-blue-600">{data.rear_setback ? `${data.rear_setback} m` : 'Belirtilmemiş'}</div>
          </div>
        </div>
      </div>
      
      {data.parcel_coordinates && data.parcel_coordinates.length > 0 && (
        <>
          <Separator className="my-6" />
          
          <div>
            <h3 className="text-lg font-semibold mb-3">Parsel Koordinatları (ITRF96/TM30)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nokta
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      X (Doğu)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Y (Kuzey)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.parcel_coordinates.map((coord, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {coord.Nokta !== undefined ? coord.Nokta : idx + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {coord.X.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {coord.Y.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            

          </div>
        </>
      )}
      
      <Separator className="my-6" />
      
      <div className="flex justify-center mt-6">
        <button 
          className="border border-gray-300 px-6 py-2 rounded-md hover:bg-gray-100 transition-colors"
          onClick={() => window.print()}
        >
          Raporu Yazdır
        </button>
      </div>
    </div>
  );
}

// Bilgi gösterimi için yardımcı bileşen
function InfoItem({ label, value }: { label: string, value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100">
      <span className="font-medium text-gray-600">{label}:</span>
      <span className="text-gray-800">{value || 'Belirtilmemiş'}</span>
    </div>
  );
}

// Koordinat görselleştirme bileşeni
function CoordinateVisualizer({ coordinates }: { coordinates: Array<{No?: number, x: number, y: number}> }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  
  React.useEffect(() => {
    if (!canvasRef.current || !coordinates || coordinates.length < 3) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Canvas boyutlarını ayarla
    const width = canvas.width;
    const height = canvas.height;
    
    // Koordinatları normalize et
    const xValues = coordinates.map(c => c.x);
    const yValues = coordinates.map(c => c.y);
    
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    
    // Çizim için margin ekle
    const margin = 30;
    const drawWidth = width - 2 * margin;
    const drawHeight = height - 2 * margin;
    
    // Aspecti koru
    let scale: number;
    if (xRange / drawWidth > yRange / drawHeight) {
      scale = drawWidth / xRange;
    } else {
      scale = drawHeight / yRange;
    }
    
    // Arka planı temizle
    ctx.clearRect(0, 0, width, height);
    
    // Parsel çizimi
    ctx.beginPath();
    coordinates.forEach((coord, index) => {
      const x = margin + (coord.x - minX) * scale;
      // Not: y koordinatları canvas'ta ters olduğu için maxY - coord.y yapıyoruz
      const y = margin + (maxY - coord.y) * scale;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      // Köşe noktalarını işaretle
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Nokta numaralarını göster
      ctx.fillStyle = 'black';
      ctx.font = '12px Arial';
      ctx.fillText((index + 1).toString(), x + 8, y + 4);
    });
    
    // Parseli tamamla
    ctx.lineTo(margin + (coordinates[0].x - minX) * scale, margin + (maxY - coordinates[0].y) * scale);
    
    // Çizgi stilini ayarla
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Parsel içini doldur
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fill();
    
  }, [coordinates]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={500} 
      height={300} 
      className="w-full h-auto border border-gray-200 rounded"
    />
  );
}