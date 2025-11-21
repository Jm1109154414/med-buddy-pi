import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Pill, Bell, BarChart3, Shield } from "lucide-react";
const Index = () => {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-gradient-primary">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-elevated mb-6">
            <Pill className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-6">Smart Pill</h1>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Pastillero inteligente. Nunca olvides tomar tus medicamentos.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="shadow-lg">
              Comenzar
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate("/auth?mode=login")}>
              Iniciar sesión
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {[{
          icon: Bell,
          title: "Notificaciones",
          desc: "Alertas push cuando es hora de tu medicamento"
        }, {
          icon: BarChart3,
          title: "Reportes",
          desc: "Seguimiento de adherencia y estadísticas"
        }, {
          icon: Shield,
          title: "Seguro",
          desc: "Tus datos protegidos con cifrado"
        }].map((feature, i) => <div key={i} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white">
              <feature.icon className="w-12 h-12 mb-4" />
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-white/80">{feature.desc}</p>
            </div>)}
        </div>
      </div>
    </div>;
};
export default Index;