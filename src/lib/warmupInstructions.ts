// Execution cues for the existing warmup checklist, not a new prescription.
export const WARMUP_INSTRUCTIONS: Record<string, string> = {
  "5 min de esteira/bike em ritmo leve": "Caminhe na esteira ou pedale com pouca resistência, em ritmo confortável para conversar.",
  "rotação de ombros": "Em pé, mova os ombros devagar em círculos, sem elevar as costelas nem forçar a amplitude.",
  "flexão lenta de braços": "Apoie as mãos, mantenha o tronco alinhado e dobre os cotovelos devagar. Use a adaptação orientada pelo professor.",
  "alongar peitoral na parede": "Apoie o antebraço na parede e gire suavemente o tronco para o lado oposto, sem dor no ombro.",
  "gato-camelo": "Em quatro apoios, arredonde e estenda suavemente a coluna, acompanhando a respiração.",
  "puxada leve com elástico": "Use o elástico preso com segurança à frente. Puxe os cotovelos para trás e retorne devagar, sem encolher os ombros.",
  "soltura de escápula": "Com os braços relaxados, aproxime e afaste suavemente as escápulas, sem arquear a lombar.",
  "círculos de braço": "Com espaço ao redor, faça círculos lentos com os braços nos dois sentidos, dentro de uma amplitude confortável.",
  "band pull-apart": "Segure um elástico leve à frente do peito. Afaste as mãos e volte devagar, mantendo os ombros relaxados.",
  "elevação lateral leve": "Com carga leve, eleve os braços lateralmente sem encolher os ombros e desça com controle.",
  "agachamento livre": "Sem peso, flexione quadris e joelhos, mantenha os pés apoiados e volte à posição inicial com controle.",
  "afundo dinâmico": "Sem carga, dê um passo e flexione os joelhos com controle. Retorne e alterne as pernas, usando apoio se necessário.",
  "mobilidade de tornozelo": "Com o pé inteiro apoiado, leve o joelho para a frente na direção dos dedos, sem levantar o calcanhar.",
  "bom-dia sem carga": "Sem peso, destrave os joelhos e leve o quadril para trás, inclinando o tronco sem arredondar as costas.",
  "balanço de perna": "Segure um apoio e balance uma perna suavemente para a frente e para trás, sem girar o tronco.",
  "alongamento dinâmico de posterior": "Com o joelho levemente flexionado, incline o tronco a partir do quadril e retorne, sem insistir no limite do alongamento.",
  "ponte de glúteo": "Deite de barriga para cima, dobre os joelhos e apoie os pés. Eleve o quadril sem arquear a lombar e desça devagar.",
  "caminhada com elástico (lateral)": "Com a miniband e os joelhos levemente flexionados, dê passos laterais curtos sem deixar os joelhos caírem para dentro.",
  "abdução em pé": "Segure um apoio e afaste a perna para o lado, mantendo a ponta do pé à frente e o tronco parado.",
  "rosca leve com elástico": "Com o elástico firme sob os pés, dobre os cotovelos sem mover o tronco e retorne lentamente.",
  "soltura de punho e cotovelo": "Abra e feche as mãos, faça círculos suaves com os punhos e flexione e estenda os cotovelos sem forçar.",
  "extensão leve com elástico": "Use o elástico preso com segurança acima de você. Estenda os cotovelos junto ao tronco e retorne com controle.",
  "mobilidade de cotovelo": "Dobre e estenda os cotovelos devagar, alternando as palmas para cima e para baixo em amplitude confortável.",
  "prancha": "Apoie os antebraços e mantenha o corpo alinhado, sem prender a respiração ou deixar o quadril cair.",
  "dead bug": "Deitado de barriga para cima, eleve braços e pernas. Estenda braço e perna opostos devagar, sem perder o controle da lombar.",
  "mobilidade de quadril e ombro": "Faça movimentos lentos e confortáveis de quadril e ombros, sem forçar a amplitude.",
  "ativar o músculo-alvo com carga leve": "Use o primeiro exercício do treino com a carga leve indicada pelo professor, sem buscar fadiga.",
};

export function warmupInstruction(label: string): string {
  const movement = label.split("—")[0].trim().toLocaleLowerCase("pt-BR");
  return WARMUP_INSTRUCTIONS[movement] || "Confirme a execução com seu professor antes de realizar este movimento.";
}
